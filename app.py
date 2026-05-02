import os
import threading
import logging
import queue
import time
from datetime import datetime
from flask import Flask, render_template, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
from flask_talisman import Talisman
from flask_compress import Compress
from flask_socketio import SocketIO, emit
import google.generativeai as genai
import google.cloud.logging

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'super-secret-nexus-key')
# Enable Compression (Gzip) for all responses (Major performance boost)
Compress(app)
# Initialize SocketIO for real-time messaging (Efficiency boost)
socketio = SocketIO(app, cors_allowed_origins="*")
# Ensure the instance folder exists for the database
if not os.path.exists('instance'):
    os.makedirs('instance')
    
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + os.path.join(os.path.abspath(os.path.dirname(__file__)), 'instance', 'nexus.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

# Enterprise Security: Talisman (Force HTTPS, CSP, Security Headers)
# We disable force_https for local development
Talisman(app, content_security_policy=None, force_https=False)

# Structured Google Cloud Logging
try:
    client = google.cloud.logging.Client()
    client.setup_logging()
    logger = logging.getLogger("nexus")
    logger.info("Integrated with Google Cloud Logging.")
except:
    logging.basicConfig(level=logging.INFO)
    logger = logging.getLogger("nexus")
    logger.warning("Cloud Logging not available, using local logging.")

# Gemini AI Setup
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY')
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
else:
    logger.warning("GEMINI_API_KEY not found. AI Assistant will be disabled.")


# ── Models ──────────────────────────────────────────────────────────────────

# Many-to-many relationship for teams and users
team_members = db.Table('team_members',
    db.Column('user_id', db.Integer, db.ForeignKey('user.id'), primary_key=True),
    db.Column('team_id', db.Integer, db.ForeignKey('team.id'), primary_key=True)
)

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(128))
    role = db.Column(db.String(20), default='member') # 'admin' or 'member'
    teams = db.relationship('Team', secondary=team_members, backref=db.backref('members', lazy='dynamic'))

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        if not self.password_hash: return True # Default for seeded users
        return check_password_hash(self.password_hash, password)

class Team(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80), unique=True, nullable=False, index=True)

class Task(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text)
    priority = db.Column(db.String(20), default='medium')
    assignee = db.Column(db.String(80), index=True)
    status = db.Column(db.String(20), default='todo', index=True)
    team_name = db.Column(db.String(80), index=True)
    date = db.Column(db.String(20))
    attachment_url = db.Column(db.String(500))


class Message(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    sender = db.Column(db.String(80), nullable=False)
    recipient = db.Column(db.String(80)) # For DMs
    content = db.Column(db.Text, nullable=False)
    channel = db.Column(db.String(80)) # For group channels
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)


# ── API Endpoints ───────────────────────────────────────────────────────────

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    username = data.get('username')
    password = data.get('password', '') # Optional password for demo
    
    user = User.query.filter_by(username=username).first()
    if user and user.check_password(password):
        logger.info(f"User {username} logged in successfully.")
        
        # Log activity to BQ
        trigger_bg_sync("user_activity", {
            "username": username,
            "action": "LOGIN",
            "details": f"Role: {user.role}"
        })
        
        return jsonify({

            "success": True,
            "username": user.username,
            "role": user.role,
            "teams": [t.name for t in user.teams]
        }), 200
    
    logger.warning(f"Failed login attempt for {username}.")
    return jsonify({"success": False, "message": "Invalid username or password."}), 401


@app.route('/api/users', methods=['GET'])
def get_users():
    users = User.query.all()
    return jsonify([{
        "id": u.id,
        "username": u.username,
        "role": u.role,
        "teams": [t.name for t in u.teams]
    } for u in users])

@app.route('/api/messages', methods=['GET'])
def get_messages():
    user = request.args.get('user')
    channel = request.args.get('channel')
    recipient = request.args.get('recipient')
    
    print(f"Fetching messages for user={user}, channel={channel}, recipient={recipient}")
    
    if recipient:
        # DM logic: messages between sender and recipient
        messages = Message.query.filter(
            ((Message.sender == user) & (Message.recipient == recipient)) |
            ((Message.sender == recipient) & (Message.recipient == user))
        ).order_by(Message.timestamp.asc()).all()
        print(f"Found {len(messages)} DM messages")
    elif channel:
        # Channel logic
        messages = Message.query.filter_by(channel=channel).order_by(Message.timestamp.asc()).all()
        print(f"Found {len(messages)} channel messages")
    else:
        return jsonify([]), 200
        
    return jsonify([{
        "sender": m.sender,
        "recipient": m.recipient,
        "content": m.content,
        "timestamp": m.timestamp.strftime("%H:%M")
    } for m in messages])

@app.route('/api/messages', methods=['POST'])
def send_message():
    data = request.json
    new_msg = Message(
        sender=data.get('sender'),
        recipient=data.get('recipient'),
        content=data.get('content'),
        channel=data.get('channel')
    )
    db.session.add(new_msg)
    db.session.commit()
    
    # Log message to BQ
    trigger_bg_sync("message_logs", {
        "sender": data.get('sender'),
        "recipient": data.get('recipient'),
        "channel": data.get('channel')
    })
    
    return jsonify({"message": "Message sent"}), 201


# ── Google Services: High-Efficiency BigQuery Queue ──────────────────────

bq_queue = queue.Queue()

def bq_worker():
    """Dedicated background thread to process BigQuery rows sequentially."""
    from google.cloud import bigquery
    client = None
    try:
        client = bigquery.Client()
    except Exception as e:
        logger.error(f"Failed to initialize BQ client in worker: {e}")
        return

    while True:
        table_name, data = bq_queue.get()
        if table_name is None: break # Shutdown signal
        
        try:
            dataset_id = os.environ.get('BQ_DATASET', 'nexus_audit')
            table_id = f"{client.project}.{dataset_id}.{table_name}"
            
            if "timestamp" not in data:
                data["timestamp"] = datetime.utcnow().isoformat()
                
            errors = client.insert_rows_json(table_id, [data])
            if errors:
                logger.error(f"BQ Sync Errors in {table_name}: {errors}")
            else:
                logger.info(f"BQ Sync Successful: {table_name}")
        except Exception as e:
            logger.error(f"BQ Sync Failed for {table_name}: {e}")
        finally:
            bq_queue.task_done()

# Start the dedicated worker thread
worker_thread = threading.Thread(target=bq_worker, daemon=True)
worker_thread.start()

def trigger_bg_sync(table_name, data):
    """Enqueues data for BigQuery sync without blocking or spawning new threads."""
    bq_queue.put((table_name, data))



@app.route('/api/users/update', methods=['POST'])
def update_user():
    data = request.json
    requester_name = data.get('requester')
    target_username = data.get('username')
    new_role = data.get('role')
    new_teams = data.get('teams', [])
    
    # RBAC Check: Only admins can update users
    requester = User.query.filter_by(username=requester_name).first()
    if not requester or requester.role != 'admin':
        return jsonify({"message": "Unauthorized: Only admins can manage users"}), 403
        
    user = User.query.filter_by(username=target_username).first()
    if not user:
        return jsonify({"message": "User not found"}), 404

        
    user.role = new_role
    team_objs = Team.query.filter(Team.name.in_(new_teams)).all()
    user.teams = team_objs
    
    db.session.commit()
    
    # Trigger non-blocking BigQuery sync
    trigger_bg_sync(target_username, new_role, new_teams)
    
    return jsonify({"message": f"Updated user {target_username}"}), 200



@app.route('/api/team/members', methods=['GET'])
def get_team_members():
    team_name = request.args.get('team')
    team = Team.query.filter_by(name=team_name).first()
    if team:
        return jsonify([u.username for u in team.members])
    return jsonify([]), 200

@app.route('/api/tasks/update', methods=['POST'])
def update_task_status():
    data = request.json
    task_id_str = data.get('id') # e.g., "task-5"
    new_status = data.get('status')
    
    if not task_id_str or not new_status:
        return jsonify({"message": "Invalid data"}), 400
        
    try:
        task_id = int(task_id_str.split('-')[1])
        task = Task.query.get(task_id)
        if task:
            task.status = new_status
            db.session.commit()
            return jsonify({"message": "Task updated"}), 200
        return jsonify({"message": "Task not found"}), 404
    except Exception as e:
        return jsonify({"message": str(e)}), 500

@app.route('/api/tasks', methods=['GET'])
def get_tasks():
    team_name = request.args.get('team')
    user_name = request.args.get('user')
    
    query = Task.query
    if team_name:
        query = query.filter_by(team_name=team_name)
    if user_name:
        query = query.filter_by(assignee=user_name)
        
    tasks = query.all()
    return jsonify([{
        "id": f"task-{t.id}",
        "title": t.title,
        "description": t.description,
        "priority": t.priority,
        "assignee": t.assignee,
        "status": t.status,
        "team": t.team_name,
        "date": t.date
    } for t in tasks])

# ── Task Attachments & GCS ──────────────────────────────────────────────────

@app.route('/api/tasks/upload', methods=['POST'])
def upload_attachment():
    if 'file' not in request.files:
        return jsonify({"message": "No file part"}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({"message": "No selected file"}), 400

    try:
        from google.cloud import storage
        client = storage.Client()
        bucket_name = os.environ.get('GCS_BUCKET', 'nexus-attachments-default')
        bucket = client.bucket(bucket_name)
        
        blob_name = f"tasks/{datetime.now().timestamp()}_{file.filename}"
        blob = bucket.blob(blob_name)
        blob.upload_from_file(file)
        
        return jsonify({"url": blob.public_url}), 200
    except Exception as e:
        logger.error(f"GCS Upload Failed: {e}")
        return jsonify({"message": "Storage service unavailable"}), 503

@app.route('/api/tasks', methods=['POST'])
def create_task():
    data = request.json
    new_task = Task(
        title=data.get('title'),
        description=data.get('description'),
        priority=data.get('priority'),
        assignee=data.get('assignee'),
        status=data.get('status', 'todo'),
        team_name=data.get('team'),
        attachment_url=data.get('attachment_url'),
        date=data.get('date', datetime.now().strftime("%m/%d/%Y"))
    )
    db.session.add(new_task)
    db.session.commit()
    return jsonify({"message": "Task created", "id": f"task-{new_task.id}"}), 201


@app.route('/api/team-access', methods=['GET'])
def check_access():
    username = request.args.get('user')
    team_name = request.args.get('team')
    
    if not username or not team_name:
        return jsonify({"access": False}), 400
        
    user = User.query.filter_by(username=username).first()
    team = Team.query.filter_by(name=team_name).first()
    
    if not user or not team:
        # For demo purposes, if user/team doesn't exist, we could return False
        # But we'll auto-create users for now to make it easier to test
        if not user:
            user = User(username=username)
            db.session.add(user)
            db.session.commit()
    
    # Check if user is in team
    if user in team.members or user.role == 'admin':
        return jsonify({"access": True}), 200
    
    return jsonify({"access": False}), 200

@app.route('/api/ai/chat', methods=['POST'])
def ai_chat():
    if not GEMINI_API_KEY:
        return jsonify({"message": "AI Assistant is currently unavailable (API Key missing)."}), 503
    
    data = request.json
    user_query = data.get('message')
    username = data.get('username')
    
    try:
        logger.info(f"AI Request received from {username}: {user_query}")
        model = genai.GenerativeModel('gemini-1.5-flash')
        
        # Contextual prompt for Nexus
        context = f"You are Nexus AI, a professional assistant. User is {username}."
        response = model.generate_content(f"{context}\n\nUser Question: {user_query}")
        
        if not response or not response.text:
            raise ValueError("Gemini returned an empty response")
            
        logger.info(f"AI Response success for {username}")
        
        return jsonify({"response": response.text})
    except Exception as e:
        logger.error(f"Gemini API Error: {str(e)}")
        return jsonify({"message": f"Nexus AI Error: {str(e)}"}), 500


@app.route('/api/teams/add-member', methods=['POST'])

def add_member():
    data = request.json
    admin_name = data.get('admin')
    user_to_add = data.get('username')
    team_name = data.get('team')
    
    admin = User.query.filter_by(username=admin_name).first()
    if not admin or admin.role != 'admin':
        return jsonify({"message": "Unauthorized: Only admins can add members"}), 403


    user = User.query.filter_by(username=user_to_add).first()
    if not user:
        user = User(username=user_to_add)
        db.session.add(user)
    
    team = Team.query.filter_by(name=team_name).first()
    if team and user not in team.members:
        team.members.append(user)
        db.session.commit()
        return jsonify({"message": f"Added {user_to_add} to {team_name}"}), 200
        
    return jsonify({"message": "User already in team or team not found"}), 400

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
        
        # Seed Teams
        teams = {}
        for name in ['Product Design', 'Engineering', 'Marketing']:
            team = Team.query.filter_by(name=name).first()
            if not team:
                team = Team(name=name)
                db.session.add(team)
            teams[name] = team
        
        # ── Sync Users from BigQuery ──────────────────────────────
        try:
            from google.cloud import bigquery
            # Try to get project ID explicitly if environment is missing it
            project_id = os.environ.get('GOOGLE_CLOUD_PROJECT')
            bq_client = bigquery.Client(project=project_id)
            dataset_id = os.environ.get('BQ_DATASET', 'nexus_audit')
            table_id = f"{bq_client.project}.{dataset_id}.users_master"

            
            print(f"Fetching users from BigQuery: {table_id}")
            query = f"SELECT username, role, teams, password_hash FROM `{table_id}`"
            bq_users = bq_client.query(query).result()
            
            for row in bq_users:
                user = User.query.filter_by(username=row.username).first()
                if not user:
                    user = User(username=row.username, role=row.role, password_hash=row.password_hash)
                    db.session.add(user)
                    db.session.flush()
                
                # Sync teams
                if row.teams:
                    team_names = [t.strip() for t in row.teams.split(',')]
                    user.teams = [teams[tn] for tn in team_names if tn in teams]
            
            db.session.commit()
            
            # Proof of sync: List local users
            local_users = [u.username for u in User.query.all()]
            print(f"Current Local Users: {local_users}")
            
            print("Successfully synced users from BigQuery.")

        except Exception as e:
            logger.error(f"CRITICAL: BigQuery user sync failed: {e}")
            print("Warning: No users synced from BigQuery. System may be empty.")
        
    app.run(debug=True, port=8080, host='0.0.0.0')


