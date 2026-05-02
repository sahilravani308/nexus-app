from flask import Flask, render_template, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
import os

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///nexus.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

# ── Models ──────────────────────────────────────────────────────────────────

# Many-to-many relationship for teams and users
team_members = db.Table('team_members',
    db.Column('user_id', db.Integer, db.ForeignKey('user.id'), primary_key=True),
    db.Column('team_id', db.Integer, db.ForeignKey('team.id'), primary_key=True)
)

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    role = db.Column(db.String(20), default='member') # 'admin' or 'member'

class Team(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80), unique=True, nullable=False)
    members = db.relationship('User', secondary=team_members, backref=db.backref('teams', lazy='dynamic'))

class Task(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text)
    priority = db.Column(db.String(20), default='medium')
    assignee = db.Column(db.String(80))
    status = db.Column(db.String(20), default='todo')
    team_name = db.Column(db.String(80))
    date = db.Column(db.String(20))

# ── API Endpoints ───────────────────────────────────────────────────────────

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/init', methods=['POST'])
def init_db():
    db.create_all()
    # Create default teams if they don't exist
    for team_name in ['Product Design', 'Engineering', 'Marketing']:
        if not Team.query.filter_by(name=team_name).first():
            db.session.add(Team(name=team_name))
    db.session.commit()
    return jsonify({"message": "Database initialized"}), 200

@app.route('/api/users', methods=['GET'])
def get_users():
    users = User.query.all()
    return jsonify([{
        "id": u.id,
        "username": u.username,
        "role": u.role,
        "teams": [t.name for t in u.teams]
    } for u in users])

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

@app.route('/api/teams/add-member', methods=['POST'])
def add_member():
    data = request.json
    admin_name = data.get('admin')
    user_to_add = data.get('username')
    team_name = data.get('team')
    
    admin = User.query.filter_by(username=admin_name).first()
    if not admin or admin.role != 'admin':
        # In a real app, you'd check auth tokens
        # For now, we'll allow 'FlaskUser' or similar if they are the first one
        pass

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
    # Initialize DB on start for simplicity in this demo
    with app.app_context():
        db.create_all()
        # Seed default teams
        for tn in ['Product Design', 'Engineering', 'Marketing']:
            if not Team.query.filter_by(name=tn).first():
                db.session.add(Team(name=tn))
        # Make first user an admin for demo
        first_user = User.query.first()
        if first_user:
            first_user.role = 'admin'
        db.session.commit()
        
    app.run(debug=True, port=8080, host='0.0.0.0')
