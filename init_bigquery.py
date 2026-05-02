from google.cloud import bigquery
import os

def initialize_bigquery():
    client = bigquery.Client()
    dataset_id = f"{client.project}.nexus_audit"
    
    # Create dataset if not exists
    dataset = bigquery.Dataset(dataset_id)
    dataset.location = "US"
    try:
        client.create_dataset(dataset, timeout=30)
        print(f"Created dataset {dataset_id}")
    except:
        print(f"Dataset {dataset_id} already exists")

    # Define tables
    tables = {
        "user_activity": [
            bigquery.SchemaField("username", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("action", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("details", "STRING"),
            bigquery.SchemaField("timestamp", "TIMESTAMP", mode="REQUIRED"),
        ],
        "users_master": [
            bigquery.SchemaField("username", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("role", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("teams", "STRING"), # Comma-separated
            bigquery.SchemaField("password_hash", "STRING"),
        ],

        "task_audit": [
            bigquery.SchemaField("task_id", "STRING"),
            bigquery.SchemaField("title", "STRING"),
            bigquery.SchemaField("assignee", "STRING"),
            bigquery.SchemaField("status", "STRING"),
            bigquery.SchemaField("timestamp", "TIMESTAMP"),
        ],
        "message_logs": [
            bigquery.SchemaField("sender", "STRING"),
            bigquery.SchemaField("recipient", "STRING"),
            bigquery.SchemaField("channel", "STRING"),
            bigquery.SchemaField("timestamp", "TIMESTAMP"),
        ]
    }

    for table_name, schema in tables.items():
        table_id = f"{dataset_id}.{table_name}"
        table = bigquery.Table(table_id, schema=schema)
        try:
            client.create_table(table, timeout=30)
            print(f"Created table {table_id}")
        except:
            print(f"Table {table_id} already exists")

    # Seed initial users to BigQuery if empty
    table_id = f"{dataset_id}.users_master"
    rows = list(client.query(f"SELECT * FROM `{table_id}` LIMIT 1").result())
    if not rows:
        from werkzeug.security import generate_password_hash
        example_users = [
            {'username': 'Alice', 'role': 'admin', 'teams': 'Product Design,Engineering'},
            {'username': 'Bob', 'role': 'member', 'teams': 'Product Design'},
            {'username': 'Charlie', 'role': 'member', 'teams': 'Engineering'},
            {'username': 'Sahil', 'role': 'member', 'teams': 'Product Design'},
            {'username': 'Admin', 'role': 'admin', 'teams': 'Marketing'}
        ]
        for u in example_users:
            u['password_hash'] = generate_password_hash('password123')
            
        errors = client.insert_rows_json(table_id, example_users)
        if not errors:
            print("Seeded BigQuery users_master table.")
        else:
            print(f"Failed to seed BigQuery: {errors}")

if __name__ == "__main__":
    initialize_bigquery()

