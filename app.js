const outputElement = document.getElementById('output');
const locationElement = document.getElementById('location');
const timeElement = document.getElementById('time');
const moneyElement = document.getElementById('money');
const rankElement = document.getElementById('rank');
const hungerElement = document.getElementById('hunger');
const warmthElement = document.getElementById('warmth');
const alarElement = document.getElementById('alar');
const exitsElement = document.getElementById('exits');
const peopleElement = document.getElementById('people');
const inventoryElement = document.getElementById('inventory');
const historyElement = document.getElementById('history');
const mapElement = document.getElementById('map');
const journalElement = document.getElementById('journal');
const quickCommandsContainer = document.getElementById('quick-commands');
const clearHistoryButton = document.getElementById('clear-history-button');
const commandForm = document.getElementById('command-form');
const commandInput = document.getElementById('command-input');

const HISTORY_STORAGE_KEY = 'kkc-adventure-history';
const QUICK_COMMANDS = ['look', 'north', 'south', 'east', 'west', 'up', 'down', 'inventory', 'status', 'journal', 'slots', 'map'];
let historyEntries = [];
let commandHistory = [];
let historyPosition = -1;

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function loadHistory() {
  try {
    const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveHistory() {
  window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(historyEntries));
}

function renderHistory() {
  historyElement.innerHTML = '';
  historyEntries.slice().reverse().forEach((entry) => {
    const container = document.createElement('div');
    container.className = 'history-entry';
    container.innerHTML = `
      <div class="history-tag">${escapeHtml(entry.command)}</div>
      <div class="history-output">${escapeHtml(entry.output)}</div>
    `;
    historyElement.appendChild(container);
  });
}

function addHistoryEntry(command, output) {
  historyEntries.unshift({ command, output });
  if (historyEntries.length > 50) {
    historyEntries = historyEntries.slice(0, 50);
  }
  saveHistory();
  renderHistory();
}

function pushCommandHistory(command) {
  if (!command) {
    return;
  }

  commandHistory = [command, ...commandHistory.filter((item) => item !== command)];
  if (commandHistory.length > 50) {
    commandHistory = commandHistory.slice(0, 50);
  }
  historyPosition = -1;
}

function clearHistory() {
  historyEntries = [];
  saveHistory();
  renderHistory();
}

function renderMap(response) {
  const locationName = response.location?.name ?? 'Unknown location';
  const exits = response.accessibleExits || [];
  const exitLines = exits.length
    ? exits.map((exit) => `${exit.direction} → ${exit.target_location_id}`).join('\n')
    : 'None';

  return `Position: ${locationName}\n\nExits:\n${exitLines}`;
}

function renderJournal(response) {
  const journalEntries = response.state.world_state_flags?.journal_entries;

  if (!Array.isArray(journalEntries) || journalEntries.length === 0) {
    return 'Your journal is empty. Complete objectives to record new entries.';
  }

  return journalEntries
    .map((entry, index) => `• ${typeof entry === 'string' ? entry : JSON.stringify(entry)}`)
    .join('\n');
}

function renderScene(response) {
  outputElement.textContent = response.output;
  locationElement.textContent = response.location?.name ?? 'Unknown';
  timeElement.textContent = response.state.time_of_day + ', Day ' + response.state.day_number;
  moneyElement.textContent = response.state.money_drabs ? response.state.money_drabs + ' drabs' : 'nothing';
  rankElement.textContent = response.state.academic_rank;
  hungerElement.textContent = response.state.hunger ?? 'unknown';
  warmthElement.textContent = response.state.warmth ?? 'unknown';
  alarElement.textContent = response.state.sympathy_state?.alar_strength ?? 'unknown';
  exitsElement.textContent = response.accessibleExits?.map((exit) => exit.direction).join(', ') || 'none';
  peopleElement.textContent = response.npcs?.map((npc) => npc.name).join(', ') || 'none';

  if (mapElement) {
    mapElement.textContent = renderMap(response);
  }

  if (journalElement) {
    journalElement.textContent = renderJournal(response);
  }

  inventoryElement.innerHTML = '';
  if (!response.state.inventory || response.state.inventory.length === 0) {
    const item = document.createElement('li');
    item.textContent = 'Nothing of note';
    inventoryElement.appendChild(item);
  } else {
    response.state.inventory.forEach((item) => {
      const li = document.createElement('li');
      li.textContent = item.quantity > 1 ? `${item.name} x${item.quantity}` : item.name;
      inventoryElement.appendChild(li);
    });
  }
}

async function executeCommand(command) {
  const trimmedCommand = command.trim();
  if (!trimmedCommand) {
    return;
  }

  try {
    const response = await fetch('/api/command', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ command: trimmedCommand })
    });

    const data = await response.json();
    if (data.error) {
      outputElement.textContent = 'Error: ' + data.error;
      addHistoryEntry(trimmedCommand, 'Error: ' + data.error);
      pushCommandHistory(trimmedCommand);
      return;
    }

    renderScene(data);
    addHistoryEntry(trimmedCommand, data.output);
    pushCommandHistory(trimmedCommand);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    outputElement.textContent = 'Network error: ' + errorMessage;
    addHistoryEntry(trimmedCommand, 'Network error: ' + errorMessage);
    pushCommandHistory(trimmedCommand);
  }
}

function createQuickCommandButtons() {
  if (!quickCommandsContainer) {
    return;
  }

  QUICK_COMMANDS.forEach((command) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'command-button';
    button.textContent = command;
    button.addEventListener('click', () => executeCommand(command));
    quickCommandsContainer.appendChild(button);
  });
}

async function init() {
  historyEntries = loadHistory();
  renderHistory();
  createQuickCommandButtons();

  try {
    const response = await fetch('/api/init');
    const data = await response.json();
    if (data.error) {
      outputElement.textContent = 'Error loading game: ' + data.error;
      return;
    }

    renderScene(data);
    addHistoryEntry('start', data.output);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    outputElement.textContent = 'Error loading game: ' + errorMessage;
  }

  commandInput.focus();
}

commandForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const command = commandInput.value.trim();
  if (!command) {
    return;
  }

  await executeCommand(command);
  commandInput.value = '';
  commandInput.focus();
});

commandInput.addEventListener('keydown', (event) => {
  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') {
    return;
  }

  if (!commandHistory.length) {
    return;
  }

  event.preventDefault();

  if (event.key === 'ArrowUp') {
    historyPosition = Math.min(historyPosition + 1, commandHistory.length - 1);
  } else {
    historyPosition = Math.max(historyPosition - 1, -1);
  }

  commandInput.value = historyPosition >= 0 ? commandHistory[historyPosition] : '';
});

clearHistoryButton.addEventListener('click', () => {
  clearHistory();
});

init();
