from flask import Flask, send_from_directory
import random
import requests
import os
import json
from dotenv import load_dotenv
load_dotenv()
import pdb

app = Flask(__name__)

wmata_api_key = os.getenv('WMATA_API_KEY')

# Path for our main Svelte page
@app.route("/")
def base():
    return send_from_directory('client/public', 'index.html')

# Path for all the static files (compiled JS/CSS, etc.)
@app.route("/<path:path>")
def home(path):
    return send_from_directory('client/public', path)

@app.route("/train_predictions")
def train_predictions():
    all_predictions = json.loads(requests.get("https://api.wmata.com/StationPrediction.svc/json/GetPrediction/All", headers={"Cache-Control": "no-cache", 'api_key': wmata_api_key}).text)
    return json.dumps(all_predictions["Trains"])


if __name__ == "__main__":
    app.run(debug=True)