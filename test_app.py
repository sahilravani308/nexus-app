import pytest
from app import app, db, User, Team

@pytest.fixture
def client():
    app.config['TESTING'] = True
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
    with app.test_client() as client:
        with app.app_context():
            db.create_all()
            # Seed minimal data
            t1 = Team(name='Engineering')
            db.session.add(t1)
            u1 = User(username='Alice', role='admin')
            u1.teams.append(t1)
            db.session.add(u1)
            db.session.commit()
        yield client

def test_login_success(client):
    rv = client.post('/api/login', json={'username': 'Alice'})
    assert rv.status_code == 200
    assert rv.get_json()['success'] is True

def test_login_fail(client):
    rv = client.post('/api/login', json={'username': 'NonExistent'})
    assert rv.status_code == 401

def test_get_users(client):
    rv = client.get('/api/users')
    assert rv.status_code == 200
    assert len(rv.get_json()) == 1

def test_team_visibility(client):
    # Fetch team members for Engineering
    rv = client.get('/api/team/members?team=Engineering')
    assert rv.status_code == 200
    assert 'Alice' in rv.get_json()
