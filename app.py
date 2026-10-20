import os
import time
from collections import defaultdict, deque

from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request
from pydantic import ValidationError

load_dotenv()  # Load OPENAI_API_KEY from .env when running locally

import museum  # noqa: E402  (needs the environment loaded first)

app = Flask(__name__)

MAX_DESCRIPTION = 400          # characters
RATE_LIMIT = int(os.getenv("RATE_LIMIT", "8"))     # acquisitions (label + image) per visitor...
RATE_WINDOW = 15 * 60                               # ...every 15 minutes
_visits = defaultdict(deque)


def too_many_requests():
    """Simple per-visitor limit, so a public link can't drain the API credit."""
    visitor = request.headers.get("X-Forwarded-For", request.remote_addr or "").split(",")[0].strip()
    now = time.time()
    visits = _visits[visitor]
    while visits and now - visits[0] > RATE_WINDOW:
        visits.popleft()
    if len(visits) >= 2 * RATE_LIMIT:              # each acquisition = one label call + one image call
        return True
    visits.append(now)
    return False


def error(message, status):
    return jsonify({"error": message}), status


def friendly(e):
    """Turn an exception into a message the visitor can understand, and log the details for me."""
    app.logger.exception(e)
    if isinstance(e, museum.MissingKeyError):
        return error("The museum is closed: the OpenAI key is missing on the server.", 500)
    if isinstance(e, museum.CuratorRefusal):
        return error(str(e) + " Try describing another object.", 422)
    text = str(e).lower()
    if "safety" in text or "content_policy" in text or "moderation" in text:
        return error("The image was refused by the safety system. Try another object.", 422)
    if "verif" in text and "organization" in text:
        return error("This OpenAI account must be verified to use the image model.", 502)
    if "quota" in text or "billing" in text:
        return error("The museum has run out of OpenAI credit.", 502)
    return error("Something went wrong in the storage room. Please try again.", 502)


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/label", methods=["POST"])
def api_label():
    description = ((request.get_json(silent=True) or {}).get("object") or "").strip()
    if not description:
        return error("Describe an object first.", 400)
    if len(description) > MAX_DESCRIPTION:
        return error(f"Please keep the description under {MAX_DESCRIPTION} characters.", 400)
    if too_many_requests():
        return error("The curator needs a break. Try again in a few minutes.", 429)
    try:
        label, problems = museum.write_label(description)
    except Exception as e:
        return friendly(e)
    if problems:
        app.logger.warning("Label still breaks rules after retries: %s", problems)
    return jsonify({"label": label.model_dump(), "problems": problems})


@app.route("/api/image", methods=["POST"])
def api_image():
    data = request.get_json(silent=True) or {}
    try:
        label = museum.WallLabel.model_validate(data.get("label"))
    except ValidationError:
        return error("No valid label was sent.", 400)
    if too_many_requests():
        return error("The curator needs a break. Try again in a few minutes.", 429)
    setting = data.get("setting", "auto")
    if setting not in museum.SETTINGS:
        setting = "auto"
    try:
        plan = museum.plan_image(label, setting)
        image = museum.make_image(plan.image_prompt)
    except Exception as e:
        return friendly(e)
    return jsonify({"image": image, "image_prompt": plan.image_prompt,
                    "scale": plan.scale, "setting": plan.setting})


if __name__ == "__main__":
    app.run(debug=True)  # Run locally for testing
