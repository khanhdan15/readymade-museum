// Two steps, so the visitor can read the label while the image is being made:
// 1. POST /api/label  -> wall label
// 2. POST /api/image  -> image written from that label (never from the visitor's text)

const form = document.getElementById("acquire-form");
const objectField = document.getElementById("object");
const settingField = document.getElementById("setting");
const submitButton = document.getElementById("submit");
const formError = document.getElementById("form-error");
const room = document.getElementById("room");
const wallLabel = document.getElementById("wall-label");
const imageFrame = document.getElementById("image-frame");
const notes = document.getElementById("notes");

// Example chips fill the text field
document.querySelectorAll(".example").forEach((chip) => {
    chip.addEventListener("click", () => {
        objectField.value = chip.textContent;
        objectField.focus();
    });
});

document.getElementById("again").addEventListener("click", () => {
    objectField.value = "";
    document.getElementById("intake").scrollIntoView({ behavior: "smooth" });
    objectField.focus();
});

async function post(url, body) {
    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    let data = {};
    try { data = await response.json(); } catch (e) { /* not JSON, e.g. a server timeout page */ }
    if (!response.ok) throw new Error(data.error || `The server answered ${response.status}. Please try again.`);
    return data;
}

// Small helper: build an element with text (never innerHTML, so nothing the model writes can inject HTML)
function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

// The extended label cites the book in *asterisks*: show that part in italics
function withItalics(text) {
    const p = el("p", "extended");
    text.split(/(\*[^*]+\*)/).forEach((part) => {
        if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
            p.appendChild(el("i", null, part.slice(1, -1)));
        } else {
            p.appendChild(document.createTextNode(part));
        }
    });
    return p;
}

function showLabel(label) {
    const t = label.tombstone;
    const title = el("p", "title");
    title.appendChild(el("i", null, t.title));
    title.appendChild(document.createTextNode(`, ${t.year}`));

    wallLabel.replaceChildren(
        el("p", "artist", t.artist_name),
        el("p", "bio", t.artist_bio),
        title,
        el("p", null, t.medium),
        el("p", null, t.dimensions),
        el("p", "gap", `Provenance: ${t.provenance}`),
        el("p", "gap credit", t.credit_line),
        el("hr"),
        withItalics(label.extended_label),
    );
}

function showStatus(container, message, isError = false) {
    container.classList.toggle("loading", !isError);
    container.replaceChildren(el("p", isError ? "status error" : "status", message));
}

form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const description = objectField.value.trim();
    formError.textContent = "";
    if (!description) {
        formError.textContent = "Describe an object first.";
        return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "Acquiring…";
    notes.hidden = true;
    room.hidden = false;
    showStatus(wallLabel, "The curator is writing the label");
    showStatus(imageFrame, "Waiting for the label");
    room.scrollIntoView({ behavior: "smooth" });

    try {
        // Step 1: the label
        const { label } = await post("/api/label", { object: description });
        showLabel(label);

        // Step 2: the image, from the label
        showStatus(imageFrame, "The photographer is installing the work (about 30 seconds)");
        const work = await post("/api/image", { label, setting: settingField.value });
        const img = new Image();
        img.src = work.image;
        img.alt = `Installation view of ${label.tombstone.title} by ${label.tombstone.artist_name}`;
        imageFrame.classList.remove("loading");
        imageFrame.replaceChildren(img);

        document.getElementById("note-scale").textContent = work.scale;
        document.getElementById("note-setting").textContent = work.setting;
        document.getElementById("note-prompt").textContent = work.image_prompt;
        notes.hidden = false;
    } catch (error) {
        // Show the error where the missing piece should be
        if (wallLabel.querySelector(".artist")) {
            showStatus(imageFrame, error.message, true);
        } else {
            showStatus(wallLabel, error.message, true);
            showStatus(imageFrame, "No work to install.", true);
        }
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = "Acquire for the collection";
    }
});
