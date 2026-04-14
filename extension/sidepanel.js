/**
 * sidepanel.js - Nexus AI Terminal Controller
 * Handles UI interactions, tab management, and visual data sync.
 */

document.addEventListener('DOMContentLoaded', async () => {
    // -------------------------------------------------------------------------
    // 1. Selector Mapping
    // -------------------------------------------------------------------------
    const els = {
        // Tab Buttons
        tabBtns: document.querySelectorAll('.tab-btn'),
        tabContents: document.querySelectorAll('.tab-content'),

        // Dashboard
        totalEqText: document.getElementById('totalEqText'),
        upnlText: document.getElementById('upnlText'),
        botStateDot: document.getElementById('botStateDot'),
        botStateText: document.getElementById('botStateText'),
        positionsTable: document.getElementById('positionsTable'),
        noPositionsMsg: document.getElementById('noPositionsMsg'),
        refreshBtn: document.getElementById('refreshBtn'),

        // Active Trade Card (Detailed View)
        activeTradeCard: document.getElementById('activeTradeCard'),
        activeSymbol: document.getElementById('activeSymbol'),
        activeLev: document.getElementById('activeLev'),
        activeSide: document.getElementById('activeSide'),
        activeROE: document.getElementById('activeROE'),
        activeSize: document.getElementById('activeSize'),
        activePNL: document.getElementById('activePNL'),
        activeEntry: document.getElementById('activeEntry'),
        activeMark: document.getElementById('activeMark'),

        // Controls
        btnStartBot: document.getElementById('btnStartBot'),
        btnStopBot: document.getElementById('btnStopBot'),
        btnKillSession: document.getElementById('btnKillSession'),
        runtimeTimer: document.getElementById('runtimeTimer'),
        leverageRange: document.getElementById('leverageRange'),
        leverageVal: document.getElementById('leverageVal'),
        levDown: document.getElementById('levDown'),
        levUp: document.getElementById('levUp'),
        riskInput: document.getElementById('riskInput'),
        riskChips: document.querySelectorAll('.risk-chip'),
        btnSaveRisk: document.getElementById('btnSaveRisk'),
        strategySelector: document.getElementById('strategySelector'),
        trailingSLToggle: document.getElementById('trailingSLToggle'),
        scalpModeToggle: document.getElementById('scalpModeToggle'),

        // Chat
        chatLog: document.getElementById('chatLog'),
        chatInput: document.getElementById('chatInput'),
        btnSendChat: document.getElementById('btnSendChat'),
        suggestChips: document.querySelectorAll('.s-chip'),

        // Settings
        apiKeyInput: document.getElementById('apiKeyInput'),
        apiSecretInput: document.getElementById('apiSecretInput'),
        workerUrlInput: document.getElementById('workerUrlInput'),
        testnetToggle: document.getElementById('testnetToggle'),
        btnSaveApi: document.getElementById('btnSaveApi'),
        groqApiKey: document.getElementById('groqApiKey'),
        newsApiKey: document.getElementById('newsApiKey'),
        btnSaveNewsAi: document.getElementById('btnSaveNewsAi'),
        deepAiEndpoint: document.getElementById('deepAiEndpoint'),
        deepAiKey: document.getElementById('deepAiKey'),
        btnTestDeepAi: document.getElementById('btnTestDeepAi'),
        btnVerifyTX: document.getElementById('btnVerifyTX'),
        expiryTimer: document.getElementById('expiryTimer'),

        // Modals
        modalOverlay: document.getElementById('modalOverlay'),
        modalTitle: document.getElementById('modalTitle'),
        modalDesc: document.getElementById('modalDesc'),
        modalCancel: document.getElementById('modalCancel'),
        modalConfirm: document.getElementById('modalConfirm'),
    };

    let botStartTime = null;

    // -------------------------------------------------------------------------
    // 2. Tab Navigation
    // -------------------------------------------------------------------------
    els.tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.getAttribute('data-tab');
            els.tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            els.tabContents.forEach(c => c.classList.remove('active'));
            document.getElementById(`tab-${tabId}`).classList.add('active');
        });
    });

    // -------------------------------------------------------------------------
    // 3. State & Storage Initialization
    // -------------------------------------------------------------------------
    async function loadConfig() {
        const data = await chrome.storage.local.get(['api', 'settings', 'botStatus', 'deepAi', 'newsAi']);
        
        // API Settings
        if (data.api) {
            els.apiKeyInput.value = data.api.key || '';
            els.apiSecretInput.value = data.api.secret || '';
            els.workerUrlInput.value = data.api.workerUrl || '';
            els.testnetToggle.checked = !!data.api.testnet;
        }

        // Deep AI Settings
        if (data.deepAi) {
            els.deepAiEndpoint.value = data.deepAi.endpoint || '';
            els.deepAiKey.value = data.deepAi.key || '';
        }

        // News AI Settings
        if (data.newsAi) {
            els.groqApiKey.value = data.newsAi.groqKey || '';
            els.newsApiKey.value = data.newsAi.newsKey || '';
        }

        // Trading Settings
        if (data.settings) {
            els.leverageRange.value = data.settings.leverage || 20;
            els.leverageVal.innerText = `${els.leverageRange.value}.0x`;
            els.riskInput.value = data.settings.risk || 1.0;
            els.strategySelector.value = data.settings.strategy || 'auto_rotate';
            
            if (data.settings.trailingSL) els.trailingSLToggle.classList.add('active');
            if (data.settings.scalpMode) els.scalpModeToggle.classList.add('active');

            // Sync risk chip
            els.riskChips.forEach(chip => {
                if (chip.getAttribute('data-val') === String(data.settings.risk)) {
                    chip.classList.add('active');
                } else {
                    chip.classList.remove('active');
                }
            });
        }

        // Bot Status
        if (data.botStatus) {
            updateBotUI(data.botStatus.running);
            if (data.botStatus.startTime) botStartTime = data.botStatus.startTime;
        }
    }

    // -------------------------------------------------------------------------
    // 4. UI Update Helpers
    // -------------------------------------------------------------------------
    function updateBotUI(isRunning) {
        if (isRunning) {
            els.botStateDot.classList.add('running');
            els.botStateText.innerText = 'Bot is Autonomous • Running';
            els.btnStartBot.style.display = 'none';
            els.btnStopBot.style.display = 'flex';
        } else {
            els.botStateDot.classList.remove('running');
            els.botStateText.innerText = 'Bot is Stopped';
            els.btnStartBot.style.display = 'flex';
            els.btnStopBot.style.display = 'none';
        }
    }

    function startTimer() {
        setInterval(() => {
            if (!botStartTime) {
                els.runtimeTimer.innerText = "Running for 0h 0m";
                return;
            }
            const diff = Date.now() - botStartTime;
            const hrs = Math.floor(diff / 3600000);
            const mins = Math.floor((diff % 3600000) / 60000);
            els.runtimeTimer.innerText = `Running for ${hrs}h ${mins}m`;
        }, 10000);
    }

    // -------------------------------------------------------------------------
    // 5. Event Handlers - Controls
    // -------------------------------------------------------------------------
    els.leverageRange.addEventListener('input', (e) => {
        els.leverageVal.innerText = `${e.target.value}.0x`;
    });
    
    // Save on change/end for slider
    els.leverageRange.addEventListener('change', () => saveSettings());

    els.levDown.addEventListener('click', () => { els.leverageRange.value--; els.leverageRange.dispatchEvent(new Event('input')); saveSettings(); });
    els.levUp.addEventListener('click', () => { els.leverageRange.value++; els.leverageRange.dispatchEvent(new Event('input')); saveSettings(); });

    els.btnSaveRisk.addEventListener('click', () => saveSettings());

    els.riskChips.forEach(chip => {
        chip.addEventListener('click', () => {
            els.riskChips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            els.riskInput.value = chip.getAttribute('data-val');
            saveSettings();
        });
    });

    els.strategySelector.addEventListener('change', () => saveSettings());

    els.trailingSLToggle.addEventListener('click', () => {
        els.trailingSLToggle.classList.toggle('active');
        document.getElementById('trailingSLText').innerText = els.trailingSLToggle.classList.contains('active') ? "ENABLED" : "DISABLED";
        saveSettings();
    });

    els.scalpModeToggle.addEventListener('click', () => {
        els.scalpModeToggle.classList.toggle('active');
        document.getElementById('scalpModeText').innerText = els.scalpModeToggle.classList.contains('active') ? "ON" : "OFF";
        saveSettings();
    });

    async function saveSettings() {
        const settings = {
            leverage: els.leverageRange.value,
            risk: els.riskInput.value,
            strategy: els.strategySelector.value,
            trailingSL: els.trailingSLToggle.classList.contains('active'),
            scalpMode: els.scalpModeToggle.classList.contains('active')
        };
        await chrome.storage.local.set({ settings });
        chrome.runtime.sendMessage({ action: "update_settings", settings });
        if (els.btnSaveRisk) {
            els.btnSaveRisk.innerText = "SAVED";
            setTimeout(() => els.btnSaveRisk.innerText = "SAVE", 1000);
        }
    }

    // -------------------------------------------------------------------------
    // 6. Bot Actions (Start/Stop/Kill)
    // -------------------------------------------------------------------------
    els.btnStartBot.addEventListener('click', async () => {
        const data = await chrome.storage.local.get(['api']);
        if (!data.api || !data.api.key) {
            showModal("Setup Required", "Please configure your Binance API Keys in the Settings tab first.", "Go to Settings", () => {
                document.querySelector('[data-tab="settings"]').click();
            });
            return;
        }

        updateBotUI(true);
        botStartTime = Date.now();
        await chrome.storage.local.set({ botStatus: { running: true, startTime: botStartTime } });
        chrome.runtime.sendMessage({ action: "start_bot" });
        pushBotMessage(`Nexus AI engine started. Strategy: ${els.strategySelector.options[els.strategySelector.selectedIndex].text}`);
    });

    els.btnStopBot.addEventListener('click', () => {
        showModal("Stop Bot?", "The bot will cease all autonomous trading. Existing positions will remain open unless manually closed.", "Stop Engine", async () => {
            updateBotUI(false);
            botStartTime = null;
            await chrome.storage.local.set({ botStatus: { running: false, startTime: null } });
            chrome.runtime.sendMessage({ action: "stop_bot" });
            pushBotMessage("Nexus AI engine halted manually.");
        });
    });

    els.btnKillSession.addEventListener('click', () => {
        showModal("⚠ KILL SESSION", "This will IMMEDIATELY market close ALL open futures positions and cancel all pending orders. Use only in emergencies.", "Close Everything", () => {
            chrome.runtime.sendMessage({ action: "kill_session" });
            updateBotUI(false);
            pushBotMessage("PANIC SIGNAL: All positions closed at market price.");
        });
    });

    // -------------------------------------------------------------------------
    // 7. Dashboard Data Sync
    // -------------------------------------------------------------------------
    els.refreshBtn.addEventListener('click', refreshDashboard);
    
    async function refreshDashboard() {
        const response = await new Promise(res => {
            chrome.runtime.sendMessage({ action: "get_dashboard_data" }, res);
        });

        if (!response || response.error) return;

        if (response.account) {
            const eq = parseFloat(response.account.totalMarginBalance).toFixed(2);
            els.totalEqText.innerText = `$${eq}`;
            const upnl = parseFloat(response.account.totalUnrealizedProfit);
            els.upnlText.innerText = `${upnl >= 0 ? '+' : ''}$${upnl.toFixed(2)}`;
            els.upnlText.className = upnl >= 0 ? "upnl-value" : "upnl-value negative";
        }

        if (response.positions) {
            const activePos = response.positions.filter(p => parseFloat(p.positionAmt) !== 0);
            
            if (activePos.length > 0) {
                const main = activePos[0];
                els.activeTradeCard.classList.remove('hidden');
                els.activeSymbol.innerText = main.symbol;
                els.activeLev.innerText = `${main.leverage}x`;
                els.activeSide.innerText = parseFloat(main.positionAmt) > 0 ? "LONG" : "SHORT";
                els.activeSide.className = `side-label ${parseFloat(main.positionAmt) > 0 ? 'secondary' : 'error'}`;
                
                const pnl = parseFloat(main.unRealizedProfit);
                els.activePNL.innerText = `${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`;
                els.activePNL.className = `stat-value ${pnl >= 0 ? 'secondary' : 'error'}`;
                
                const margin = parseFloat(main.isolatedWallet) || (parseFloat(main.notional) / parseFloat(main.leverage));
                const roe = (pnl / Math.max(0.01, Math.abs(margin))) * 100;
                els.activeROE.innerText = `${roe >= 0 ? '+' : ''}${roe.toFixed(2)}%`;
                els.activeROE.className = `roe-value ${roe >= 0 ? 'secondary' : 'error'}`;

                els.activeSize.innerText = Math.abs(parseFloat(main.positionAmt)).toFixed(3);
                els.activeEntry.innerText = parseFloat(main.entryPrice).toFixed(main.entryPrice < 1 ? 5 : 2);
                els.activeMark.innerText = parseFloat(main.markPrice).toFixed(main.markPrice < 1 ? 5 : 2);
            } else {
                els.activeTradeCard.classList.add('hidden');
            }

            els.positionsTable.querySelectorAll('.pos-row').forEach(r => r.remove());
            if (activePos.length === 0) {
                els.noPositionsMsg.classList.remove('hidden');
            } else {
                els.noPositionsMsg.classList.add('hidden');
                activePos.forEach(p => {
                    const row = document.createElement('div');
                    row.className = 'pos-row';
                    const isLong = parseFloat(p.positionAmt) > 0;
                    const pnl = parseFloat(p.unRealizedProfit);
                    row.innerHTML = `
                        <div class="flex flex-col">
                            <span class="pos-symbol font-bold text-[12px]">${p.symbol}</span>
                            <span class="text-[9px] font-bold ${isLong ? 'text-secondary' : 'text-error'}">${isLong ? 'LONG' : 'SHORT'} ${p.leverage}x</span>
                        </div>
                        <div class="flex items-center justify-end">
                            <span class="text-[12px] font-medium">${Math.abs(parseFloat(p.positionAmt)).toFixed(3)}</span>
                        </div>
                        <div class="flex flex-col items-end">
                            <span class="text-[12px] font-black ${pnl >= 0 ? 'text-secondary' : 'text-error'}">${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}</span>
                            <span class="opacity-60 text-[9px] font-bold">${p.symbol}</span>
                        </div>
                    `;
                    els.positionsTable.appendChild(row);
                });
            }
        }
    }

    setInterval(refreshDashboard, 5000);

    // -------------------------------------------------------------------------
    // 8. Chat System
    // -------------------------------------------------------------------------
    els.btnSendChat.addEventListener('click', handleChatInput);
    els.chatInput.addEventListener('keypress', (e) => { if(e.key === 'Enter') handleChatInput(); });

    els.suggestChips.forEach(chip => {
        chip.addEventListener('click', () => {
            const cmd = chip.getAttribute('data-cmd');
            els.chatInput.value = cmd;
            handleChatInput();
        });
    });

    async function handleChatInput() {
        const val = els.chatInput.value.trim();
        if (!val) return;

        appendMessage('user', val);
        els.chatInput.value = "";

        if (val.startsWith('/')) {
            handleCommand(val);
            return;
        }

        const data = await chrome.storage.local.get(['api']);
        if (data.api && data.api.workerUrl) {
            try {
                const res = await fetch(`${data.api.workerUrl}/chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ prompt: val })
                });
                const response = await res.json();
                appendMessage('bot', response.reply || "No response signal from Nexus AI.");
            } catch (e) {
                appendMessage('bot', "Connection to Nexus AI Worker failed.");
            }
        } else {
            appendMessage('bot', "Worker not configured. Use local commands like /status.");
        }
    }

    function handleCommand(cmd) {
        const c = cmd.split(' ')[0];
        switch(c) {
            case '/status':
                refreshDashboard().then(() => {
                    const eq = els.totalEqText.innerText;
                    appendMessage('bot', `Nexus AI Status: ONLINE. Equity: ${eq}. Engine: ${els.botStateDot.classList.contains('running') ? 'ACTIVE' : 'IDLE'}. Strategy: ${els.strategySelector.value}.`);
                });
                break;
            case '/positions':
                refreshDashboard().then(() => {
                    appendMessage('bot', `Viewing current open positions in Dashboard.`);
                    document.querySelector('[data-tab="dashboard"]').click();
                });
                break;
            case '/strategy':
                appendMessage('bot', `Active Strategy: ${els.strategySelector.options[els.strategySelector.selectedIndex].text}. Use Controls to change.`);
                break;
            case '/news':
                appendMessage('bot', '🔍 Fetching latest News AI analysis... Check back in a moment.');
                chrome.runtime.sendMessage({ action: "run_news_ai" });
                break;
            case '/help':
                appendMessage('bot', "Available Commands: /status, /positions, /strategy, /news, /ai, /help");
                break;
            default:
                appendMessage('bot', `Unknown command signal: ${cmd}`);
        }
    }

    function appendMessage(sender, text) {
        const msg = document.createElement('div');
        msg.className = `chat-msg ${sender} flex flex-col ${sender === 'user' ? 'items-end' : 'items-start'} max-w-[85%] ${sender === 'user' ? 'self-end' : ''} mt-4`;
        const senderName = sender === 'user' ? 'Commander' : 'Nexus AI';
        const bubbleClass = sender === 'user' ? 'user' : 'bot';
        msg.innerHTML = `
            <div class="flex items-center gap-2 mb-1 mr-1 ml-1">
               <span class="text-[10px] font-bold text-on-surface-variant uppercase">${senderName}</span>
            </div>
            <div class="msg-bubble ${bubbleClass}">
               <p>${text.replace(/\n/g, '<br>')}</p>
            </div>
        `;
        els.chatLog.appendChild(msg);
        els.chatLog.scrollTop = els.chatLog.scrollHeight;
    }

    function pushBotMessage(text) {
        appendMessage('bot', text);
    }

    // Listen for background events (e.g. strategy rotation)
    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.action === "push_log") {
            pushBotMessage(msg.message);
        }
    });

    // -------------------------------------------------------------------------
    // 9. Settings Save
    // -------------------------------------------------------------------------
    els.btnSaveApi.addEventListener('click', async () => {
        const api = {
            key: els.apiKeyInput.value,
            secret: els.apiSecretInput.value,
            workerUrl: els.workerUrlInput.value,
            testnet: els.testnetToggle.checked
        };
        await chrome.storage.local.set({ api });
        els.btnSaveApi.innerText = "SAVED";
        setTimeout(() => els.btnSaveApi.innerText = "SAVE CREDENTIALS", 2000);
        chrome.runtime.sendMessage({ action: "reload_config" });
    });

    els.btnTestDeepAi.addEventListener('click', async () => {
        const endpoint = els.deepAiEndpoint.value;
        const key = els.deepAiKey.value;
        await chrome.storage.local.set({ deepAi: { endpoint, key } });
        
        els.btnTestDeepAi.innerText = "TESTING...";
        try {
            // Mock call for testing logic
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
                body: JSON.stringify({ action: "test" })
            });
            if (res.ok) {
                els.btnTestDeepAi.innerText = "SUCCESS ✓";
            } else {
                els.btnTestDeepAi.innerText = "FAILED ✗";
            }
        } catch (e) {
            els.btnTestDeepAi.innerText = "ERROR ✗";
        }
        setTimeout(() => els.btnTestDeepAi.innerText = "TEST AI CONNECTION", 3000);
    });

    // Save News AI Keys
    els.btnSaveNewsAi.addEventListener('click', async () => {
        const newsAi = {
            groqKey: els.groqApiKey.value,
            newsKey: els.newsApiKey.value
        };
        await chrome.storage.local.set({ newsAi });
        chrome.runtime.sendMessage({ action: "reload_config" });
        els.btnSaveNewsAi.innerText = "SAVED ✓";
        setTimeout(() => els.btnSaveNewsAi.innerText = "SAVE NEWS AI KEYS", 2000);
    });

    // -------------------------------------------------------------------------
    // 10. Modals
    // -------------------------------------------------------------------------
    let modalCallback = null;
    function showModal(title, desc, confirmText, callback) {
        els.modalTitle.innerText = title;
        els.modalDesc.innerText = desc;
        els.modalConfirm.innerText = confirmText;
        modalCallback = callback;
        els.modalOverlay.classList.remove('hidden');
    }
    els.modalCancel.addEventListener('click', () => els.modalOverlay.classList.add('hidden'));
    els.modalConfirm.addEventListener('click', () => {
        if (modalCallback) modalCallback();
        els.modalOverlay.classList.add('hidden');
    });

    // Init
    loadConfig();
    startTimer();
    refreshDashboard();
});
