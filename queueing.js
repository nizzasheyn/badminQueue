async function generateFirstGame() {

    let numCourts = getNumCourtsFromSettings();
    let playersRange = getPlayersFromSettings();

    // Check if players or courts are missing
    if (playersRange.length === 0 || numCourts === "" || numCourts <= 0) {
        showNotification("Please ensure that the player list and number of courts are properly filled out.");
        return; // Stop execution if validation fails
    }

    document.querySelectorAll('.placeholder-row').forEach(row => row.remove());

    let courtNumber, gameNumber;
    let availablePlayers = [];
    let gameCount = {};

    // Load players from the settings sheet
    playersRange.forEach(player => {
        if (player.trim() !== "") {
            availablePlayers.push(player);
            gameCount[player] = 0;
        }
    });

    // Identify players already queued in unstarted games
    let reservedPlayers = new Set();
    let lastUnstartedGamePlayers = [];

    const rows = document.querySelectorAll("#gameTable tbody tr");
    for (let i = rows.length - 1; i >= 0; i--) {
        const row = rows[i];
        const input = row.cells[2]?.querySelector("input");

        if (input) {
            const names = input.value.split(",").map(name => name.trim()).filter(Boolean);
            names.forEach(name => reservedPlayers.add(name));

            // Save the most recent unstarted game's players
            if (lastUnstartedGamePlayers.length === 0) {
                lastUnstartedGamePlayers = [...names];
            }
        }
    }

    // Build preferred and fallback lists without mutating availablePlayers
    let preferredPlayers = [];
    let fallbackPlayers = [];

    playersRange.forEach(player => {
        if (!player) return;

        const isReserved = reservedPlayers.has(player);
        const isInLastUnstarted = lastUnstartedGamePlayers.includes(player);

        if (!isReserved) {
            preferredPlayers.push(player);
        } else if (!isInLastUnstarted) {
            fallbackPlayers.push(player);
        }
    });

    // Combine into final list of players to consider
    availablePlayers = [...preferredPlayers, ...fallbackPlayers];

    // Determine game number based on current rows in the game table
    const existingGames = rows.length;
    gameNumber = existingGames + 1;

    // Use round-robin court allocation (1 to numCourts)
    courtNumber = (gameNumber - 1) % numCourts + 1;

    // Build game count from existing table rows
    rows.forEach(row => {
        const playersCell = row.cells[2]; // 3rd column = index 2
        if (!playersCell) return;
        const names = playersCell.textContent.split(",");
        names.forEach(p => {
            p = p.trim();
            if (gameCount[p] !== undefined) {
                gameCount[p] += 1;
            }
        });
    });

    // Find min games played
    const minCount = Math.min(...Object.values(gameCount));

    console.log('$$availablePlayers', availablePlayers);
    // Collect players with the lowest game count
    let selectedIndexes = [];
    availablePlayers.forEach((player, i) => {
        if (gameCount[player] === minCount) {
            selectedIndexes.push(i);
        }
    });

    // Track last played row index (relative to games in the table)
    let lastPlayedRow = {};
    playersRange.forEach(player => {
        if (player.trim() !== "") {
            lastPlayedRow[player] = -1; // -1 means never played
        }
    });

    rows.forEach((row, rowIndex) => {
        const playersCell = row.cells[2];
        if (!playersCell) return;
        const names = playersCell.textContent.split(",");
        names.forEach(p => {
            p = p.trim();
            if (lastPlayedRow[p] !== undefined) {
                lastPlayedRow[p] = rowIndex;
            }
        });
    });

    // Combine least played with longest waiting if needed
    let usedIndexes = [];
    let priorityIndexes = [...selectedIndexes];

    if (priorityIndexes.length < 4) {
        let playerWaitTime = {};
        availablePlayers.forEach((player, i) => {
            if (!alreadyUsedIndex(priorityIndexes, i)) {
                const lastRow = lastPlayedRow[player];
                playerWaitTime[i] = rows.length - (lastRow === -1 ? -1 : lastRow);
            }
        });

        const sortedIndexes = sortDictionaryByValueDescending(playerWaitTime);
        sortedIndexes.forEach(i => {
            if (priorityIndexes.length >= 4) return;
            priorityIndexes.push(i);
        });
    }

    // Final: pick 4 players from priorityIndexes randomly
    let selectedPlayers = [];
    for (let i = 0; i < 4; i++) {
        let idx;
        do {
            idx = Math.floor(Math.random() * priorityIndexes.length);
        } while (alreadyUsedIndex(usedIndexes, priorityIndexes[idx]));

        usedIndexes.push(priorityIndexes[idx]);
        selectedPlayers[i] = availablePlayers[priorityIndexes[idx]];
    }

    // Output to Queueing sheet
    await outputToQueueingSheet(gameNumber, courtNumber, selectedPlayers);
    
    updateGameSummaryTable(selectedPlayers);
}

// Helper: check if index is already selected
function alreadyUsedIndex(col, val) {
    return col.includes(val);
}

// Sort dictionary by value descending, return key array
function sortDictionaryByValueDescending(dict) {
    return Object.keys(dict)
        .sort((a, b) => dict[b] - dict[a]);
}

function getPlayersFromSettings() {
    const playersInput = document.getElementById('players').value;
    return playersInput.split(',').map(name => name.trim()).filter(name => name);
}

function getGameDateFromSettings() {
    return document.getElementById('gameDate').value;
}

function getLocationFromSettings() {
    return document.getElementById('location').value;
}

function getNumCourtsFromSettings() {
    return document.getElementById('numCourts').value;
}

function getNumCourtsFromSettings() {
    const numCourts = document.getElementById('numCourts').value;
    return numCourts;
}

function alreadyUsedIndex(col, val) {
    return col.includes(val);
}

function sortDictionaryByValueDescending(dict) {
    return Object.keys(dict).sort((a, b) => dict[b] - dict[a]);
}

function outputToQueueingSheet(gameNumber, courtNumber, selectedPlayers) {
    const newRow = document.createElement("tr");

    newRow.innerHTML = `
        <td>${gameNumber}</td>
        <td>${courtNumber}</td>
        <td>
            <input type="text" value="${selectedPlayers.join(', ')}" style="width: 100%; padding: 6px; margin-bottom: 0;" />
        </td>
        <td>
            <button class="start-btn" style="padding: 6px 12px;">Start</button>
            <button class="edit-btn hide-edit" style="padding: 6px 12px;">Edit</button>
        </td>
    `;

    const gameTableBody = document.querySelector("#gameTable tbody");
    gameTableBody.appendChild(newRow);

    // Handle Start button click
    const startBtn = newRow.querySelector(".start-btn");
    const editBtn = newRow.querySelector('.edit-btn');
    startBtn.addEventListener("click", () => {
        const inputField = newRow.querySelector("input");
        const newPlayers = inputField.value.trim();

        if (newPlayers === "" || newPlayers.split(",").length != 4) {
            showNotification("Player list must have 4 players.");
            return;
        }

        // Replace input with text
        const td = inputField.parentElement;
        td.textContent = newPlayers;

        // Remove start button
        startBtn.remove();
        editBtn.classList.remove("hide-edit");
        editBtn.classList.add("show-edit");

        updateGameSummaryTable(selectedPlayers);
    });

    editBtn.addEventListener("click", () => {
        // Get the Players <td> in this specific row
        const playersTd = newRow.querySelector("td:nth-child(3)");
        const currentPlayers = playersTd.textContent.trim();

        // Replace the text with an input field so user can edit
        playersTd.innerHTML = `
            <input type="text" value="${currentPlayers}" style="width: 100%; padding: 6px; margin-bottom: 0;" />
        `;

        // Hide Edit button, show Start again
        editBtn.classList.add("hide-edit");
        editBtn.classList.remove("show-edit");

        // Create a new Start button (to save changes)
        const newStartBtn = document.createElement("button");
        newStartBtn.textContent = "Start";
        newStartBtn.classList.add("start-btn");
        newStartBtn.style.padding = "6px 12px";

        // Append Start button back to actions cell
        const actionsTd = newRow.querySelector("td:last-child");
        actionsTd.appendChild(newStartBtn);

        // Reattach the "save" behavior
        newStartBtn.addEventListener("click", () => {
            const input = playersTd.querySelector("input");
            const newPlayers = input.value.trim();

            if (newPlayers === "") {
                alert("Player list cannot be empty.");
                return;
            }

            // Replace input with the new player names text
            playersTd.textContent = newPlayers;

            // Hide Start, show Edit again
            newStartBtn.remove();
            editBtn.classList.remove("hide-edit");
            editBtn.classList.add("show-edit");

            updateGameSummaryTable();
        });
    });
}

function updateGameSummaryTable(selectedPlayers) {
    const gameTableBody = document.querySelector("#gameTable tbody");
    const summaryHeader = document.getElementById("summaryHeader");
    const summaryBody = document.getElementById("summaryBody");

    const rows = gameTableBody.querySelectorAll("tr");

    // Build set of all players
    const playerSet = getPlayersFromSettings();
    // rows.forEach(row => {
    //     const players = row.cells[2].textContent.split(',').map(p => p.trim());
    //     players.forEach(p => playerSet.add(p));
    // });
    console.log('$$playerSet -->', playerSet);
    const allPlayers = Array.from(playerSet).sort(); // Optional: sorted player list
    const gameCount = rows.length;

    // Clear existing header and rows
    summaryHeader.innerHTML = '<th>Player</th><th>Total</th>'; // 👈 Added Total column
    summaryBody.innerHTML = '';

    // Build header row for each game
    for (let i = 1; i <= gameCount; i++) {
        const th = document.createElement('th');
        th.textContent = `${i}`;
        th.style.width = '42.5px';
        th.style.padding = '12px 0';
        th.style.textAlign = 'center';
        summaryHeader.appendChild(th);
    }

    // Build rows for each player
    allPlayers.forEach(player => {
        const tr = document.createElement('tr');

        // Player name cell
        const nameCell = document.createElement('td');
        nameCell.textContent = player;
        tr.appendChild(nameCell);

        // Total games played cell
        let totalGames = 0;
        rows.forEach(row => {
            let playersInGame = [];
            const playersCell = row.cells[2];
            const input = playersCell.querySelector("input");
            if (input) {
                playersInGame = input.value.split(',').map(p => p.trim());
            } else {
                playersInGame = playersCell.textContent.split(',').map(p => p.trim());
            }

            if (playersInGame.includes(player)) {
                totalGames++;
            }
        });
        const totalCell = document.createElement('td');
        totalCell.textContent = totalGames;
        totalCell.style.textAlign = "center";
        tr.appendChild(totalCell);

        // Cells for each game
        rows.forEach(row => {
            const td = document.createElement('td');

            let playersInGame = [];
            const playersCell = row.cells[2];
            const input = playersCell.querySelector("input");
            if (input) {
                playersInGame = input.value.split(',').map(p => p.trim());
            } else {
                playersInGame = playersCell.textContent.split(',').map(p => p.trim());
            }

            const isGameStarted = !row.cells[2].querySelector("input");

            if (playersInGame.includes(player)) {
                td.style.backgroundColor = isGameStarted ? '#a18cbc' : '#c4c3d0';
                td.style.width = '42.5px';
                td.style.padding = '12px 0';
            }

            tr.appendChild(td);
        });

        summaryBody.appendChild(tr);
    });
}


function showNotification(message) {
    const notification = document.getElementById("notification");
    notification.textContent = message;
    notification.classList.add("show");

    // Automatically hide the notification after 3 seconds
    setTimeout(() => {
        notification.classList.remove("show");
    }, 3000);
}

function showEmptySummaryMessage() {
    const summaryBody = document.getElementById("summaryBody");
    summaryBody.innerHTML = ""; // Clear previous content

    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 3;
    cell.textContent = "No summary available";
    cell.style.textAlign = "center";
    cell.style.fontStyle = "italic";
    row.appendChild(cell);

    summaryBody.appendChild(row);
}


