// Two steps, so the visitor can read the label while the image is being made:
// 1. POST /api/label  -> wall label
// 2. POST /api/image  -> image written from that label (never from the visitor's text)

const form = document.getElementById("acquire-form");
const objectField = document.getElementById("object");
const settingField = document.getElementById("setting");
const submitButton = document.getElementById("submit");
const formError = document.getElementById("form-error");
const wallLabel = document.getElementById("wall-label");
const frame = document.getElementById("frame");
const againButton = document.getElementById("again");
const notes = document.getElementById("notes");

// Example objects fill the text field
document.querySelectorAll(".example").forEach((chip) => {
    chip.addEventListener("click", () => {
        objectField.value = chip.textContent;
        objectField.focus();
    });
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

// Build an element with text. Never innerHTML, so nothing the model writes can inject HTML.
function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

// The extended label cites the book in *asterisks*: show that part in italics
function withItalics(text) {
    const p = el("p");
    text.split(/(\*[^*]+\*)/).forEach((part) => {
        if (part.length > 2 && part.startsWith("*") && part.endsWith("*")) {
            p.appendChild(el("i", null, part.slice(1, -1)));
        } else {
            p.appendChild(document.createTextNode(part));
        }
    });
    return p;
}

// Accession numbers count up in this browser: 2026.0001, 2026.0002, ...
function nextAccessionNumber() {
    let n;
    try {
        n = Number(localStorage.getItem("accessions") || 0) + 1;
        localStorage.setItem("accessions", n);
    } catch (e) {
        n = Math.floor(Math.random() * 9000) + 1000;
    }
    return `Acc. no. ${new Date().getFullYear()}.${String(n).padStart(4, "0")}`;
}

function showLabel(label) {
    const t = label.tombstone;
    const title = el("p");
    title.appendChild(el("i", null, t.title));
    title.appendChild(document.createTextNode(`, ${t.year}`));
    const dot = el("span", "dot");      // red "acquired" sticker, right after the year
    dot.title = "Acquired";
    title.appendChild(dot);

    wallLabel.replaceChildren(
        el("p", "artist", t.artist_name),
        el("p", "bio", t.artist_bio),
        title,
        el("p", null, t.medium),
        el("p", null, t.dimensions),
        el("p", "gap", `Provenance: ${t.provenance}`),
        el("p", "gap muted", t.credit_line),
        el("hr"),
        withItalics(label.extended_label),
        el("p", "accession", nextAccessionNumber()),
    );
}

function labelStatus(message, isError = false) {
    wallLabel.replaceChildren(el("p", isError ? "status error" : "status working", message));
}

function wallStatus(message, isError = false) {
    frame.classList.add("empty");
    frame.replaceChildren(el("p", isError ? "frame-text error" : "frame-text working", message));
}

function resetRoom() {
    form.hidden = false;
    wallLabel.hidden = true;
    againButton.hidden = true;
    notes.hidden = true;
    notes.open = false;
    wallStatus("This wall is waiting for your object.");
    frame.querySelector(".frame-text").classList.remove("working");
}

againButton.addEventListener("click", () => {
    resetRoom();
    objectField.value = "";
    objectField.focus();
});

form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const description = objectField.value.trim();
    formError.textContent = "";
    if (!description) {
        formError.textContent = "Describe an object first.";
        return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "Accessioning…";

    try {
        // Step 1: the label. The accession card turns into the wall label.
        form.hidden = true;
        wallLabel.hidden = false;
        labelStatus("The curator is writing the label");
        wallStatus("Waiting for the label");
        const { label } = await post("/api/label", { object: description });
        showLabel(label);

        // Step 2: the image, from the label
        wallStatus("Installing the work, about 30 seconds");
        const work = await post("/api/image", { label, setting: settingField.value });
        const img = new Image();
        img.src = work.image;
        img.alt = `Installation view of ${label.tombstone.title} by ${label.tombstone.artist_name}`;
        frame.classList.remove("empty");
        frame.replaceChildren(img);

        document.getElementById("note-scale").textContent = work.scale;
        document.getElementById("note-setting").textContent = work.setting;
        document.getElementById("note-prompt").textContent = work.image_prompt;
        notes.hidden = false;
    } catch (error) {
        if (wallLabel.querySelector(".artist")) {
            wallStatus(error.message, true);           // label worked, image failed
        } else {
            labelStatus(error.message, true);          // label failed
            wallStatus("Nothing was installed.", true);
        }
    } finally {
        againButton.hidden = false;
        submitButton.disabled = false;
        submitButton.textContent = "Accession";
    }
});
