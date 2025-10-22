// === Core Game Generation ===
async function generateFirstGame() {
    const numCourts = +getNumCourtsFromSettings();
    const playersRange = getPlayersFromSettings();

    if (playersRange.length === 0 || !numCourts) {
        showNotification("Please ensure that the player list and number of courts are properly filled out.");
        return;
    }

    document.querySelectorAll('.placeholder-row').forEach(row => row.remove());

    const gameTableBody = document.querySelector("#gameTable tbody");
    const rows = Array.from(gameTableBody.querySelectorAll("tr"));
    const gameNumber = rows.length + 1;
    const courtNumber = (gameNumber - 1) % numCourts + 1;

    // === Build stats ===
    const playerStats = {};
    playersRange.forEach(p => {
        playerStats[p] = { gamesPlayed: 0, lastPlayedIndex: -1 };
    });

    // Build match history
    const matchHistory = {};
    playersRange.forEach(p => (matchHistory[p] = {}));

    rows.forEach((row, index) => {
        const players = row.cells[1]?.textContent.split(",").map(p => p.trim()).filter(Boolean);
        players.forEach(p => {
            if (playerStats[p]) {
                playerStats[p].gamesPlayed++;
                playerStats[p].lastPlayedIndex = index;
            }
        });
        // Record pairings
        for (let i = 0; i < players.length; i++) {
            for (let j = i + 1; j < players.length; j++) {
                const a = players[i];
                const b = players[j];
                if (!matchHistory[a][b]) matchHistory[a][b] = 0;
                if (!matchHistory[b][a]) matchHistory[b][a] = 0;
                matchHistory[a][b]++;
                matchHistory[b][a]++;
            }
        }
    });

    // === Sort by fairness first ===
    const sortedPlayers = [...playersRange].sort((a, b) => {
        const aStats = playerStats[a];
        const bStats = playerStats[b];
        if (aStats.gamesPlayed !== bStats.gamesPlayed)
            return aStats.gamesPlayed - bStats.gamesPlayed;
        return aStats.lastPlayedIndex - bStats.lastPlayedIndex;
    });

    // === Choose 4 players minimizing repeat matchups ===
    let bestGroup = null;
    let bestScore = Infinity;

    const combinations = getCombinations(sortedPlayers, 4);
    for (const combo of combinations) {
        // Score = fairness weight + matchup weight
        const fairnessScore = combo.reduce((s, p) => s + playerStats[p].gamesPlayed, 0);
        let matchupScore = 0;
        for (let i = 0; i < combo.length; i++) {
            for (let j = i + 1; j < combo.length; j++) {
                matchupScore += matchHistory[combo[i]][combo[j]] || 0;
            }
        }
        const totalScore = fairnessScore * 2 + matchupScore * 3; // adjust weights
        if (totalScore < bestScore) {
            bestScore = totalScore;
            bestGroup = combo;
        }
    }

    const selectedPlayers = bestGroup || sortedPlayers.slice(0, 4);

    outputToQueueingSheet(selectedPlayers, gameNumber);
    updateGameSummaryTable(selectedPlayers, gameNumber);
}

// === Utility to get combinations of N elements ===
function getCombinations(arr, n) {
    const result = [];
    const f = (prefix, start) => {
        if (prefix.length === n) {
            result.push(prefix);
            return;
        }
        for (let i = start; i < arr.length; i++) {
            f([...prefix, arr[i]], i + 1);
        }
    };
    f([], 0);
    return result;
}


// === Table Output ===
function outputToQueueingSheet(selectedPlayers, gameNumber) {
    const tbody = document.querySelector("#gameTable tbody");
    const row = document.createElement("tr");

    row.innerHTML = `
        <td>${gameNumber}</td>
        <td>${selectedPlayers.join(", ")}</td>
        <td>
            <button class="start-btn" style="padding:6px;margin:3px;width:60px;">Start</button>
            <button class="edit-btn" style="padding:6px;margin:3px;width:60px;">Edit</button>
        </td>
    `;
    tbody.appendChild(row);

    const startBtn = row.querySelector(".start-btn");
    const editBtn = row.querySelector(".edit-btn");

    startBtn.addEventListener("click", () => {
        startBtn.remove();
        updateGameSummaryTable(selectedPlayers, gameNumber);
    });

    editBtn.addEventListener("click", () => editRow(row, gameNumber));

    // 🔹 Scroll to the last entry
    row.scrollIntoView({ behavior: "smooth", block: "end" });
}

let editingRow = null;
let currentButton = null;

// === Editing Functions ===
function editRow(row, gameNumber) {
    if (editingRow) return;
    editingRow = row;

    const playersCell = row.cells[1];
    const actionsCell = row.cells[2];
    const currentPlayers = playersCell.textContent.split(",").map(p => p.trim());

    playersCell.innerHTML = `
        <div class="players-list">
            ${[0, 1, 2, 3].map(i =>
                `<button class="table-btn" onclick="replacePlayer(event)">${currentPlayers[i] || "name" + (i + 1)}</button>`
            ).join("")}
        </div>
    `;

    actionsCell.innerHTML = `
        <button class="save-btn" style="padding:6px;margin:3px;width:60px;" onclick="saveQueueInline(${gameNumber})">Save</button>
        <button class="cancel-btn" style="padding:6px;margin:3px;width:60px;" onclick="cancelEdit(${gameNumber})">Cancel</button>
    `;
}

function saveQueueInline(gameNumber) {
    const row = editingRow;
    if (!row) return;

    const playersCell = row.cells[1];
    const selectedPlayers = Array.from(row.querySelectorAll(".table-btn"))
        .map(btn => btn.textContent.trim())
        .filter(Boolean);

    if (selectedPlayers.length !== 4) {
        alert("Please select 4 players before saving.");
        return;
    }

    // ✅ Update player names in the table
    playersCell.textContent = selectedPlayers.join(", ");

    // ✅ Rebuild the Actions cell
    const actionsCell = row.cells[2];
    actionsCell.innerHTML = `
        <button class="start-btn" style="padding:6px;margin:3px;width:60px;">Start</button>
        <button class="edit-btn" style="padding:6px;margin:3px;width:60px;">Edit</button>
    `;

    const startBtn = actionsCell.querySelector(".start-btn");
    const editBtn = actionsCell.querySelector(".edit-btn");

    // ✅ Start button — no longer responsible for summary refresh
    startBtn.addEventListener("click", () => {
        startBtn.remove(); // game marked as started
        // no updateGameSummaryTable here — handled in Save
    });

    // ✅ Edit button — to reopen for editing
    editBtn.addEventListener("click", () => editRow(row, gameNumber));

    // ✅ Update the summary table for only this game
    updateGameSummaryTable(selectedPlayers, gameNumber);

    // ✅ Remove yellow border highlight from summary for this game
    const summaryBody = document.getElementById("summaryBody");
    const lastGameColIndex = gameNumber + 1; // +1 because "Player" + "Total" columns come first
    Array.from(summaryBody.querySelectorAll("tr")).forEach(tr => {
        const td = tr.cells[lastGameColIndex];
        if (td && td.style.borderColor === "rgb(242, 221, 35)") {
            td.style.border = "none";
        }
    });

    // ✅ Clear edit tracking
    editingRow = null;
}

function cancelEdit(gameNumber) {
    if (!editingRow) return;
    const row = editingRow;
    const playersCell = row.cells[1];
    const actionsCell = row.cells[2];

    const currentButtons = row.querySelectorAll(".table-btn");
    const originalPlayers = Array.from(currentButtons).map(btn => btn.textContent.trim());

    playersCell.textContent = originalPlayers.join(", ");
    actionsCell.innerHTML = `
        <button class="start-btn" style="padding:6px;margin:3px;width:60px;">Start</button>
        <button class="edit-btn" style="padding:6px;margin:3px;width:60px;">Edit</button>
    `;

    const startBtn = actionsCell.querySelector(".start-btn");
    const editBtn = actionsCell.querySelector(".edit-btn");
    startBtn.addEventListener("click", () => {
        startBtn.remove();
        updateGameSummaryTable(originalPlayers, gameNumber);
    });
    editBtn.addEventListener("click", () => editRow(row, gameNumber));

    editingRow = null;
}

// === Modal Player Selection ===
function replacePlayer(event) {
    currentButton = event.target;
    const playerModal = document.getElementById("playerModal");
    playerModal.style.display = "flex";

    const playerList = document.getElementById("playerList");
    playerList.innerHTML = "";
    const allPlayers = getPlayersFromSettings();
    const currentPlayers = Array.from(document.querySelectorAll(".table-btn")).map(b => b.textContent.trim());

    allPlayers.forEach(player => {
        const li = document.createElement("li");
        li.textContent = player;
        li.style.cursor = "pointer";

        if (currentPlayers.includes(player) && player !== currentButton.textContent.trim()) {
            li.style.opacity = "0.5";
            li.style.pointerEvents = "none";
        } else {
            li.onclick = () => selectPlayer(li);
        }
        playerList.appendChild(li);
    });
}

function closeModal() {
    document.getElementById("playerModal").style.display = "none";
}

function selectPlayer(li) {
    if (currentButton) {
        const oldName = currentButton.textContent;
        currentButton.textContent = li.textContent;
        highlightChangedPlayer(oldName, li.textContent);
    }
    closeModal();
}

// === Highlight Updated Player ===
function highlightChangedPlayer(oldName, newName) {
    const summaryBody = document.getElementById("summaryBody");
    const rows = summaryBody.querySelectorAll("tr");

    const gameTableBody = document.querySelector("#gameTable tbody");
    const lastGameColIndex = gameTableBody.rows.length + 1; // Player + Total offset

    rows.forEach(tr => {
        const playerName = tr.cells[0].textContent.trim();
        if (playerName === newName) {
            const td = tr.cells[lastGameColIndex];
            if (td) {
                td.style.border = "2px solid #f2dd23";
            }
        }
    });
}

// === Summary Table Update ===
function updateGameSummaryTable(selectedPlayers, gameNumber) {
    const gameTableBody = document.querySelector("#gameTable tbody");
    const summaryHeader = document.getElementById("summaryHeader");
    const summaryBody = document.getElementById("summaryBody");
    const rows = gameTableBody.querySelectorAll("tr");
    const targetRow = rows[gameNumber - 1];
    if (!targetRow) return;

    const allPlayers = new Set(getPlayersFromSettings());
    rows.forEach(row => {
        const text = row.cells[1]?.textContent.trim() || "";
        text.split(",").map(p => p.trim()).forEach(p => allPlayers.add(p));
    });

    const sortedPlayers = Array.from(allPlayers).sort();

    // Ensure header for this game number
    if (summaryHeader.children.length <= gameNumber + 1) {
        const th = document.createElement("th");
        th.textContent = gameNumber;
        th.style.width = "42.5px";
        th.style.textAlign = "center";
        summaryHeader.appendChild(th);
    }

    sortedPlayers.forEach(player => {
        let tr = Array.from(summaryBody.children).find(r => r.cells[0].textContent === player);
        if (!tr) {
            tr = document.createElement("tr");
            tr.innerHTML = `<td>${player}</td><td style="text-align:center">0</td>`;
            summaryBody.appendChild(tr);
        }

        let td = tr.cells[gameNumber + 1];
        if (!td) {
            td = document.createElement("td");
            td.style.width = "42.5px";
            td.style.textAlign = "center";
            tr.appendChild(td);
        }

        const playersInGame = targetRow.cells[1].textContent.split(",").map(p => p.trim());
        const startBtn = targetRow.querySelector(".start-btn");
        td.style.backgroundColor = playersInGame.includes(player)
            ? (startBtn ? "#c4c3d0" : "#a18cbc")
            : "";

        // Update total count
        const total = Array.from(rows).reduce((count, row) => {
            const names = row.cells[1].textContent.split(",").map(p => p.trim());
            return count + (names.includes(player) ? 1 : 0);
        }, 0);
        tr.cells[1].textContent = total;
    });

    scrollSummaryToLastGame();
}

function scrollSummaryToLastGame() {
    const summaryContainer = document.querySelector(".summary-container"); // wrap table in a scrollable div
    const summaryHeader = document.getElementById("summaryHeader");
    if (!summaryHeader) return;

    // Get the last TH (latest game)
    const lastTh = summaryHeader.lastElementChild;
    if (lastTh && summaryContainer) {
        // Scroll horizontally so the last column is visible
        const offsetLeft = lastTh.offsetLeft + lastTh.offsetWidth;
        summaryContainer.scrollLeft = offsetLeft - summaryContainer.clientWidth;
    }
}

// === Utility ===
function getPlayersFromSettings() {
    return document.getElementById("players").value.split(",").map(n => n.trim()).filter(Boolean);
}
function getNumCourtsFromSettings() {
    return document.getElementById("numCourts").value;
}
function showNotification(msg) {
    const n = document.getElementById("notification");
    n.textContent = msg;
    n.classList.add("show");
    setTimeout(() => n.classList.remove("show"), 3000);
}
