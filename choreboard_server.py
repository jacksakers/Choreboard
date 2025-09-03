import json
from flask import Flask, request, jsonify, send_from_directory, redirect, url_for
from flask_cors import CORS
import os

# --- Basic Setup ---
app = Flask(__name__)
# Enable CORS (Cross-Origin Resource Sharing) to allow your frontend
# to communicate with this backend.
CORS(app)

# Define the path for our database file.
# This makes sure we know where the file is, regardless of where we run the script from.
DB_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'db.json')
PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))

# --- Helper Functions for Data ---

def read_data():
    """Reads the entire database from the JSON file."""
    # Check if the file exists. If not, create it with a default structure.
    if not os.path.exists(DB_FILE):
        # This is the initial state of your app when it first runs.
        default_data = {
            "users": [
                {"id": 1, "name": "Alex"},
                {"id": 2, "name": "Jordan"}
            ],
            "masterChores": [
                {"id": 1, "name": "Washed a dish", "points": 5, "type": "repeatable"},
                {"id": 2, "name": "Cleaned cat litter", "points": 20, "type": "repeatable"}
            ],
            "currentWeek": {
                "prize": "Winner picks dinner!",
                "assignedChores": [],
                "completedLog": []
            }
        }
        write_data(default_data)
        return default_data
    
    # If the file exists, read and return its content.
    with open(DB_FILE, 'r') as f:
        return json.load(f)

def write_data(data):
    """Writes the given data object to the JSON file."""
    with open(DB_FILE, 'w') as f:
        json.dump(data, f, indent=4)

# --- Frontend Serving ---

@app.route('/')
def index():
    """Redirects the root URL to the main choreboard page."""
    return redirect(url_for('serve_choreboard_app'))

@app.route('/choreboard')
def serve_choreboard_app():
    """Serves the main HTML file for the Choreboard application."""
    app.logger.info("GET /choreboard - Serving the main application page")
    # This securely serves the 'index.html' file from the same directory as the script.
    return send_from_directory(PROJECT_ROOT, 'index.html')

@app.route('/static/<path:filename>')
def serve_static(filename):
    """Serves static files (CSS, JS, images, etc.)."""
    app.logger.info(f"GET /static/{filename} - Serving static file")
    return send_from_directory(os.path.join(PROJECT_ROOT, 'static'), filename)


# --- API Endpoints ---

@app.route('/api/state', methods=['GET'])
def get_state():
    """Endpoint to get the entire current state of the application."""
    app.logger.info("GET /api/state - Fetching current state")
    data = read_data()
    return jsonify(data)

@app.route('/api/log_chore', methods=['POST'])
def log_chore():
    """Endpoint to log a completed chore."""
    payload = request.json
    app.logger.info(f"POST /api/log_chore - Payload: {payload}")
    
    data = read_data()
    data['currentWeek']['completedLog'].append(payload)
    write_data(data)
    
    return jsonify(data)

@app.route('/api/update_weekly_chore', methods=['POST'])
def update_weekly_chore():
    """Endpoint to update the completion status of a weekly chore."""
    payload = request.json # Expects { choreId, userId, completed }
    app.logger.info(f"POST /api/update_weekly_chore - Payload: {payload}")

    data = read_data()
    
    # Find the assigned chore and update its status
    for chore in data['currentWeek']['assignedChores']:
        if chore['choreId'] == payload['choreId'] and chore['userId'] == payload['userId']:
            chore['completed'] = payload['completed']
            break
            
    # Add or remove the chore from the completed log based on its status
    if payload['completed']:
        # Add to log if it's not already there
        log_exists = any(
            log['choreId'] == payload['choreId'] and log['userId'] == payload['userId'] 
            for log in data['currentWeek']['completedLog']
        )
        if not log_exists:
            data['currentWeek']['completedLog'].append({
                "logId": payload.get('logId', payload['choreId']), # Use a unique ID
                "choreId": payload['choreId'],
                "userId": payload['userId'],
                "timestamp": payload.get('timestamp')
            })
    else:
        # Remove from log if it exists
        data['currentWeek']['completedLog'] = [
            log for log in data['currentWeek']['completedLog']
            if not (log['choreId'] == payload['choreId'] and log['userId'] == payload['userId'])
        ]

    write_data(data)
    return jsonify(data)

@app.route('/api/add_chore', methods=['POST'])
def add_chore():
    """Endpoint to add a new chore to the master list and assign if weekly."""
    new_chore_data = request.json # Expects { id, name, points, type, assignedUserId? }
    app.logger.info(f"POST /api/add_chore - Payload: {new_chore_data}")
    
    data = read_data()
    
    # Add to master list
    chore_to_add = {
        "id": new_chore_data['id'],
        "name": new_chore_data['name'],
        "points": new_chore_data['points'],
        "type": new_chore_data['type']
    }
    data['masterChores'].append(chore_to_add)
    
    # If it's a weekly chore, assign it to the user for the current week
    if new_chore_data['type'] == 'weekly' and 'assignedUserId' in new_chore_data:
        data['currentWeek']['assignedChores'].append({
            "choreId": new_chore_data['id'],
            "userId": new_chore_data['assignedUserId'],
            "completed": False
        })
        
    write_data(data)
    return jsonify(data)

@app.route('/api/delete_chore', methods=['POST'])
def delete_chore():
    """Endpoint to delete a chore from the master list and the current week."""
    payload = request.json # Expects { choreId }
    chore_id_to_delete = payload['choreId']
    app.logger.info(f"POST /api/delete_chore - Deleting chore ID: {chore_id_to_delete}")

    data = read_data()
    
    # Filter the chore out of all relevant lists
    data['masterChores'] = [c for c in data['masterChores'] if c['id'] != chore_id_to_delete]
    data['currentWeek']['assignedChores'] = [ac for ac in data['currentWeek']['assignedChores'] if ac['choreId'] != chore_id_to_delete]
    data['currentWeek']['completedLog'] = [log for log in data['currentWeek']['completedLog'] if log['choreId'] != chore_id_to_delete]
    
    write_data(data)
    return jsonify(data)

@app.route('/api/reset_week', methods=['POST'])
def reset_week():
    """Endpoint to start a new week."""
    payload = request.json # Expects { prize }
    app.logger.info(f"POST /api/reset_week - New prize: {payload['prize']}")
    
    data = read_data()
    
    # Reset the weekly data
    data['currentWeek']['prize'] = payload['prize']
    data['currentWeek']['completedLog'] = []
    for chore in data['currentWeek']['assignedChores']:
        chore['completed'] = False
        
    write_data(data)
    return jsonify(data)

# --- Main Execution ---
if __name__ == '__main__':
    # We will run the app on port 5001 to avoid conflicts.
    # Host '0.0.0.0' makes it accessible from any device on your network.
    app.run(host='0.0.0.0', port=5001, debug=True)
