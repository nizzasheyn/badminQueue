let playersInitList = [];
let playersNewList = [];
let playerStats = {};
let matchHistory = {};
let tempPlayerStats = {};
let tempMatchHistory = {};

function checkPlayerChange (event) {
    playersNewList = event.target.value.split(",").map(n => n.trim()).filter(Boolean).sort();
    init();
}

function getInitialPlayerList (event) {
    playersInitList = event.target.value.split(",").map(n => n.trim()).filter(Boolean).sort();
}

function init() {
    buildSummaryTable (playersNewList);

    playersNewList.forEach(p => {
        playerStats[p] = { gamesPlayed: 0, lastPlayedIndex: -1 };
    });

    playersNewList.forEach(p => (matchHistory[p] = {}));
}

// === Core Game Generation ===
function generateGame() {
	const numCourts = +getNumCourtsFromSettings();

	if (playersNewList.length === 0 || !numCourts) {
		showNotification("Please ensure that the player list and number of courts are properly filled out.");
		return;
	}

	// 🧹 Remove placeholders if any
	document.querySelectorAll('.placeholder-row').forEach(row => row.remove());

	const gameTableBody = document.querySelector("#gameTable tbody");
	const rows = Array.from(gameTableBody.querySelectorAll("tr"));
	const gameNumber = rows.length + 1;
	const courtNumber = (gameNumber - 1) % numCourts + 1;

    if (!Object.keys(tempPlayerStats).length) {
        tempPlayerStats = JSON.parse(JSON.stringify(playerStats));
        tempMatchHistory = JSON.parse(JSON.stringify(matchHistory));
    }

	// === Sort players by fairness (who’s played less / played less recently) ===
	const sortedPlayers = [...playersNewList].sort((a, b) => {
		const aStats = tempPlayerStats[a] || { gamesPlayed: 0, lastPlayedIndex: Infinity };
		const bStats = tempPlayerStats[b] || { gamesPlayed: 0, lastPlayedIndex: Infinity };

		if (aStats.gamesPlayed !== bStats.gamesPlayed)
			return aStats.gamesPlayed - bStats.gamesPlayed;

		return (aStats.lastPlayedIndex ?? Infinity) - (bStats.lastPlayedIndex ?? Infinity);
	});

	// === Choose 4 players minimizing repeat matchups ===
	let bestGroup = null;
	let bestScore = Infinity;
	const combinations = getCombinations(sortedPlayers, 4);

	for (const combo of combinations) {
		// Fairness: total number of games played by this group
		const fairnessScore = combo.reduce((sum, p) => sum + (tempPlayerStats[p]?.gamesPlayed || 0), 0);

		// Matchup: how often these players have faced each other
		let matchupScore = 0;
		for (let i = 0; i < combo.length; i++) {
			for (let j = i + 1; j < combo.length; j++) {
				matchupScore += (tempMatchHistory[combo[i]]?.[combo[j]] || 0);
			}
		}

		const totalScore = fairnessScore * 2 + matchupScore * 3; // tweak weights as needed
		if (totalScore < bestScore) {
			bestScore = totalScore;
			bestGroup = combo;
		}
	}

	const selectedPlayers = bestGroup || sortedPlayers.slice(0, 4);

	// === ✅ Only now update stats & match history for the selected players ===
    selectedPlayers.forEach(player => {
		if (!tempPlayerStats[player]) {
			tempPlayerStats[player] = { gamesPlayed: 0, lastPlayedIndex: -1 };
		}
		tempPlayerStats[player].gamesPlayed++;
		tempPlayerStats[player].lastPlayedIndex = gameNumber;
	});

	for (let i = 0; i < selectedPlayers.length; i++) {
		for (let j = i + 1; j < selectedPlayers.length; j++) {
			const a = selectedPlayers[i];
			const b = selectedPlayers[j];

			if (!tempMatchHistory[a]) tempMatchHistory[a] = {};
			if (!tempMatchHistory[b]) tempMatchHistory[b] = {};
			if (!tempMatchHistory[a][b]) tempMatchHistory[a][b] = 0;
			if (!tempMatchHistory[b][a]) tempMatchHistory[b][a] = 0;

			tempMatchHistory[a][b]++;
			tempMatchHistory[b][a]++;
		}
	}

	// === Output results ===
	outputToQueueingSheet(selectedPlayers, gameNumber);
	updateGameSummaryTable(selectedPlayers, gameNumber);
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
        handleOnStart(row, gameNumber);
    });
    editBtn.addEventListener("click", () => editRow(row, gameNumber));
}

function handleOnStart(row, gameNumber) {
    const playersText = row.cells[1].textContent.trim();
    const selectedPlayers = playersText.split(",").map(p => p.trim()).filter(Boolean);

    // ✅ Update actual stats
    selectedPlayers.forEach(player => {
        if (!playerStats[player]) {
            playerStats[player] = { gamesPlayed: 0, lastPlayedIndex: -1 };
        }
        playerStats[player].gamesPlayed++;
        playerStats[player].lastPlayedIndex = gameNumber;
    });

    for (let i = 0; i < selectedPlayers.length; i++) {
        for (let j = i + 1; j < selectedPlayers.length; j++) {
            const a = selectedPlayers[i];
            const b = selectedPlayers[j];

            if (!matchHistory[a]) matchHistory[a] = {};
            if (!matchHistory[b]) matchHistory[b] = {};
            if (!matchHistory[a][b]) matchHistory[a][b] = 0;
            if (!matchHistory[b][a]) matchHistory[b][a] = 0;

            matchHistory[a][b]++;
            matchHistory[b][a]++;
        }
    }

    updateGameSummaryTable(selectedPlayers, gameNumber);
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
                `<button class="table-btn" onclick="replacePlayer(event, ${gameNumber})">${currentPlayers[i] || "name" + (i + 1)}</button>`
            ).join("")}
        </div>
    `;

    actionsCell.innerHTML = `
        <button class="save-btn" style="padding:6px;margin:3px;width:60px;" onclick="saveQueueInline(${gameNumber})">Save</button>
    `;
}

function updateStatsAfterEdit(oldPlayers, newPlayers, gameNumber) {
    // --- Step 1: Remove previous counts for old players ---
    oldPlayers.forEach(player => {
        if (playerStats[player]) {
            playerStats[player].gamesPlayed = Math.max(0, playerStats[player].gamesPlayed - 1);
            // Optional: adjust lastPlayedIndex if needed
        }
    });

    for (let i = 0; i < oldPlayers.length; i++) {
        for (let j = i + 1; j < oldPlayers.length; j++) {
            const a = oldPlayers[i];
            const b = oldPlayers[j];
            if (matchHistory[a]?.[b]) matchHistory[a][b] = Math.max(0, matchHistory[a][b] - 1);
            if (matchHistory[b]?.[a]) matchHistory[b][a] = Math.max(0, matchHistory[b][a] - 1);
        }
    }

    // --- Step 2: Apply counts for new players ---
    newPlayers.forEach((player, index) => {
        if (!playerStats[player]) playerStats[player] = { gamesPlayed: 0, lastPlayedIndex: null };
        playerStats[player].gamesPlayed++;
        playerStats[player].lastPlayedIndex = gameNumber; // track game index
    });

    for (let i = 0; i < newPlayers.length; i++) {
        for (let j = i + 1; j < newPlayers.length; j++) {
            const a = newPlayers[i];
            const b = newPlayers[j];
            if (!matchHistory[a]) matchHistory[a] = {};
            if (!matchHistory[b]) matchHistory[b] = {};
            if (!matchHistory[a][b]) matchHistory[a][b] = 0;
            if (!matchHistory[b][a]) matchHistory[b][a] = 0;

            matchHistory[a][b]++;
            matchHistory[b][a]++;
        }
    }
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
        handleOnStart(row, gameNumber);
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

// function cancelEdit(gameNumber) {
//     if (!editingRow) return;
//     const row = editingRow;
//     const playersCell = row.cells[1];
//     const actionsCell = row.cells[2];

//     const currentButtons = row.querySelectorAll(".table-btn");
//     const originalPlayers = Array.from(currentButtons).map(btn => btn.textContent.trim());

//     playersCell.textContent = originalPlayers.join(", ");
//     actionsCell.innerHTML = `
//         <button class="start-btn" style="padding:6px;margin:3px;width:60px;">Start</button>
//         <button class="edit-btn" style="padding:6px;margin:3px;width:60px;">Edit</button>
//     `;

//     const startBtn = actionsCell.querySelector(".start-btn");
//     const editBtn = actionsCell.querySelector(".edit-btn");
//     startBtn.addEventListener("click", () => {
//         startBtn.remove();
//         handleOnStart(row, gameNumber);
//     });
//     editBtn.addEventListener("click", () => editRow(row, gameNumber));

//     editingRow = null;
// }

// === Modal Player Selection ===
function replacePlayer(event, gameNumber) {
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
            li.onclick = () => selectPlayer(li,gameNumber);
        }
        playerList.appendChild(li);
    });
}

function closeModal() {
    document.getElementById("playerModal").style.display = "none";
}

function selectPlayer(li, gameNumber) {
    if (currentButton) {
        const oldName = currentButton.textContent;
        currentButton.textContent = li.textContent;
        highlightChangedPlayer(oldName, li.textContent, gameNumber);
    }
    closeModal();
}

// === Highlight Updated Player ===
function highlightChangedPlayer(oldName, newName, gameNumber) {
    const summaryBody = document.getElementById("summaryBody");
    const rows = summaryBody.querySelectorAll("tr");

    const gameTableBody = document.querySelector("#gameTable tbody");
    // const lastGameColIndex = gameTableBody.rows.length + 1; // Player + Total offset

    rows.forEach(tr => {
        const playerName = tr.cells[0].textContent.trim();
        if (playerName === newName) {
            const td = tr.cells[gameNumber + 1];
            if (td) {
                td.style.border = "2px solid #f2dd23";
            }
        }

        if (playerName === oldName) {
            const td = tr.cells[gameNumber + 1];
            if (td) {
                td.style.backgroundColor = "";
            }
        }
    });
}

function buildSummaryTable() {
    if (playersInitList !== playersNewList) {
        const gameTableBody = document.querySelector("#gameTable tbody");
        const summaryHeader = document.getElementById("summaryHeader");
        const summaryBody = document.getElementById("summaryBody");

		// 🧹 Remove placeholder row if present
		const placeholder = summaryBody.querySelector(".placeholder-row");
		if (placeholder) placeholder.remove();

        playersNewList.forEach(player => {
            // Check if player already exists in summary table
            let tr = Array.from(summaryBody.children).find(r => r.cells[0].textContent === player);

            // If not, create a new row for the player
            if (!tr) {
                tr = document.createElement("tr");
                tr.innerHTML = `<td>${player}</td><td style="text-align:center">0</td>`;

                // Find correct sorted position for the new player
                const rows = Array.from(summaryBody.children);
                let inserted = false;

                for (let i = 0; i < rows.length; i++) {
                    const existingName = rows[i].cells[0].textContent;
                    if (player.localeCompare(existingName, undefined, { sensitivity: 'base' }) < 0) {
                        summaryBody.insertBefore(tr, rows[i]); // insert in sorted order
                        inserted = true;
                        break;
                    }
                }

                // If not inserted anywhere (i.e., player is last alphabetically)
                if (!inserted) {
                    summaryBody.appendChild(tr);
                }
            }
        });
    }
}

// === Summary Table Update ===
function updateGameSummaryTable(selectedPlayers, gameNumber) {
    const gameTableBody = document.querySelector("#gameTable tbody");
    const summaryHeader = document.getElementById("summaryHeader");
    const summaryBody = document.getElementById("summaryBody");
    const rows = gameTableBody.querySelectorAll("tr");
    const targetRow = rows[gameNumber - 1];
    if (!targetRow) return;

    if (summaryHeader.children.length <= gameNumber + 1) {
        const th = document.createElement("th");
        th.textContent = gameNumber;
        th.style.width = "42.5px";
        th.style.textAlign = "center";
        summaryHeader.appendChild(th);
    }

    const playersInGame = targetRow.cells[1].textContent
        .split(",")
        .map(p => p.trim())
        .filter(Boolean);
    const startBtn = targetRow.querySelector(".start-btn");

    selectedPlayers.forEach(player => {
        // Find or create player row
        let tr = Array.from(summaryBody.children).find(r => r.cells[0].textContent === player);
        if (!tr) {
            tr = document.createElement("tr");
            tr.innerHTML = `<td>${player}</td><td style="text-align:center">0</td>`;
            summaryBody.appendChild(tr);
        }

        while (tr.cells.length <= gameNumber + 1) {
            const td = document.createElement("td");
            td.style.width = "42.5px";
            td.style.textAlign = "center";
            tr.appendChild(td);
        }

        const td = tr.cells[gameNumber + 1];

        // Apply highlight color only to this game column
        td.style.backgroundColor = playersInGame.includes(player)
            ? (startBtn ? "#c4c3d0" : "#a18cbc")
            : "";

        // Update total appearances
        const total = Array.from(rows).reduce((count, row) => {
            const names = row.cells[1].textContent.split(",").map(p => p.trim());
            return count + (names.includes(player) ? 1 : 0);
        }, 0);
        tr.cells[1].textContent = total;
    });

    // scrollSummaryToLastGame();
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
function getPlayersFromSettings() {
    return document.getElementById("players").value.split(",").map(n => n.trim()).filter(Boolean).sort();
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
