from google.cloud import bigquery
import os

def init_bigquery(project_id):
    client = bigquery.Client(project=project_id)
    dataset_id = f"{project_id}.nexus_rbac"
    
    # Create Dataset
    dataset = bigquery.Dataset(dataset_id)
    dataset.location = "US"
    
    try:
        dataset = client.create_dataset(dataset, timeout=30)
        print(f"Created dataset {client.project}.{dataset.dataset_id}")
    except Exception as e:
        print(f"Dataset might already exist: {e}")

    # Create Roles Table
    roles_table_id = f"{dataset_id}.user_roles"
    schema = [
        bigquery.SchemaField("username", "STRING", mode="REQUIRED"),
        bigquery.SchemaField("role", "STRING", mode="REQUIRED"),
        bigquery.SchemaField("team", "STRING", mode="NULLABLE"),
        bigquery.SchemaField("updated_at", "TIMESTAMP", default_value_expression="CURRENT_TIMESTAMP"),
    ]
    table = bigquery.Table(roles_table_id, schema=schema)
    try:
        client.create_table(table)
        print(f"Created table {roles_table_id}")
    except Exception as e:
        print(f"Table might already exist: {e}")

    # Create Access Logs Table
    logs_table_id = f"{dataset_id}.access_logs"
    schema = [
        bigquery.SchemaField("username", "STRING", mode="REQUIRED"),
        bigquery.SchemaField("action", "STRING", mode="REQUIRED"), # e.g., 'view_board', 'add_member'
        bigquery.SchemaField("target", "STRING", mode="NULLABLE"), # e.g., 'Engineering'
        bigquery.SchemaField("status", "STRING", mode="REQUIRED"), # e.g., 'allowed', 'denied'
        bigquery.SchemaField("timestamp", "TIMESTAMP", default_value_expression="CURRENT_TIMESTAMP"),
    ]
    table = bigquery.Table(logs_table_id, schema=schema)
    try:
        client.create_table(table)
        print(f"Created table {logs_table_id}")
    except Exception as e:
        print(f"Table might already exist: {e}")

if __name__ == "__main__":
    # Get project ID from env or fallback
    project_id = os.getenv("GOOGLE_CLOUD_PROJECT", "ultimate-opus-329309")
    init_bigquery(project_id)
