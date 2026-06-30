"""
app.py
------
Flask entry point. Stays under 40 lines.
All logic lives in services/ and routes/.
"""

import logging
from flask import Flask
from flask_cors import CORS
from config import SECRET_KEY, MAX_UPLOAD_SIZE
from routes.api import api_bp
from database.db import init_db

init_db()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

app = Flask(__name__)
app.config["SECRET_KEY"]        = SECRET_KEY
app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_SIZE


# Allow all origins for frontend HTML files served separately
# In production: replace "*" with your actual domain
CORS(app, resources={r"/api/*": {"origins": "*"}})

app.register_blueprint(api_bp)

if __name__ == "__main__":
    logging.getLogger(__name__).info(
        "iPeek starting on http://localhost:5000\n"
        "Note: First launch loads bge-m3 + reranker (~30-60s)"
    )
    app.run(debug=True, port=5000)
