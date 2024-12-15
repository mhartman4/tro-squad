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

@app.route("/stations")
def stations():
    response = json.loads(requests.get("https://api.wmata.com/Rail.svc/json/jStations", headers={"Cache-Control": "no-cache", 'api_key': wmata_api_key}).text)
    stations = []
    
    ## WMATA treats intersection stations as two different ones, let's merge them and add an array of lines
    for station in response["Stations"]:
        station["Lines"] = [station["LineCode1"],station["LineCode2"],station["LineCode3"],station["LineCode4"]]
        station["Lines"] = [line for line in station["Lines"] if line != None]
    for station in response["Stations"]:
        matches = [match for match in response["Stations"] if station["StationTogether1"] == match["Code"]]
        for match in matches:
            for line in match["Lines"]:
                station["Lines"].append(line)
            response["Stations"].remove(match)
    return json.dumps(response["Stations"])


@app.route("/bus_stops")
def bus_stops():
    response = json.loads(requests.get("http://api.wmata.com/Bus.svc/json/jStops", headers={"Cache-Control": "no-cache", 'api_key': wmata_api_key}).text)
    return response["Stops"]

@app.route("/bus_predictions/<stops>")
def bus_predictions(stops):
    predictions = {}
    for stop in json.loads(stops):
        response = json.loads(requests.get(f"http://api.wmata.com/NextBusService.svc/json/jPredictions?StopID={stop}", headers={"Cache-Control": "no-cache", 'api_key': wmata_api_key}).text)
        predictions[stop] = response["Predictions"]
    return predictions

if __name__ == "__main__":
    app.run(debug=True)