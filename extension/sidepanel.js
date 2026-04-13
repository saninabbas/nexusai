// sidepanel.js

document.addEventListener('DOMContentLoaded', async () => {
    // -------------------------------------------------------------
    // Tab Navigation
    // -------------------------------------------------------------
    const tabs = document.querySelectorAll('.tab-btn');
    const contents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => {
                t.classList.remove('active');
                t.classList.add('hover:text-[#FCD535]');
                t.style.borderBottomColor = 'transparent';
                t.style.color = '#E2E2EB';
            });
            contents.forEach(c => c.classList.remove('active'));

            tab.classList.add('active');
            tab.classList.remove('hover:text-[#FCD535]');
            tab.style.borderBottomColor = '#FCD535';
            tab.style.color = '#FCD535';

            const tabId = tab.getAttribute('data-tab');
            document.getElementById(`tab-${tabId}`).classList.add('active');
        });
    });

    // -------------------------------------------------------------
    // State Loading & Elements
    // -------------------------------------------------------------
    const els = {
        apiKey: document.getElementById('apiKeyInput'),
        apiSecret: document.getElementById('apiSecretInput'),
        workerUrl: document.getElementById('workerUrlInput'),
        testnetToggle: document.getElementById('testnetToggle'),
        btnSaveApi: document.getElementById('btnSaveApi'),
        txHashInput: document.getElementById('txHashInput'),
        btnValidateLicense: document.getElementById('btnValidateLicense'),
        licenseStatusTxt: document.getElementById('licenseStatusTxt'),
        licenseBadge: document.getElementById('licenseBadge'),
        
        btnStartBot: document.getElementById('btnStartBot'),
        btnStopBot: document.getElementById('btnStopBot'),
        btnKillSession: document.getElementById('btnKillSession'),
        
        leverageRange: document.getElementById('leverageRange'),
        leverageVal: document.getElementById('leverageVal'),
        riskRange: document.getElementById('riskRange'),
        riskVal: document.getElementById('riskVal'),
        btnSaveRisk: document.getElementById('btnSaveRisk'),
        
        totalEqText: document.getElementById('totalEqText'),
        upnlText: document.getElementById('upnlText'),
        botStateText: document.getElementById('botStateText'),
        botStateDot: document.getElementById('botStateDot'),
        refreshBtn: document.getElementById('refreshBtn'),
        positionsTable: document.getElementById('positionsTable'),
        noPositionsMsg: document.getElementById('noPositionsMsg'),

        chatInput: document.getElementById('chatInput'),
        btnSendChat: document.getElementById('btnSendChat'),
        chatLog: document.getElementById('chatLog'),
    };

    let licenseActive = false;

    // Load initial settings
    const data = await chrome.storage.local.get(['api', 'settings', 'license', 'botStatus']);
    
    if (data.api) {
        els.apiKey.value = data.api.key || '';
        els.apiSecret.value = data.api.secret || '';
        els.workerUrl.value = data.api.workerUrl || '';
        els.testnetToggle.checked = !!data.api.testnet;
    }
    
    if (data.settings) {
        els.leverageRange.value = data.settings.leverage || 20;
        els.leverageVal.innerText = `${els.leverageRange.value}x`;
        els.riskRange.value = data.settings.risk || 5;
        els.riskVal.innerText = `${els.riskRange.value}%`;
    }

    if (data.license && data.license.active) {
        licenseActive = true;
        els.licenseBadge.classList.remove('hidden');
    }

    // Load Bot Status
    function updateBotUI(isRunning) {
        if (isRunning) {
            els.btnStartBot.classList.add('hidden');
            els.btnStopBot.classList.remove('hidden');
            els.botStateText.innerText = 'Bot is Autonomous • Running';
            els.botStateDot.className = 'w-1.5 h-1.5 rounded-full bg-secondary shadow-[0_0_8px_rgba(68,223,163,0.6)]';
        } else {
            els.btnStopBot.classList.add('hidden');
            els.btnStartBot.classList.remove('hidden');
            els.botStateText.innerText = 'Bot is Stopped';
            els.botStateDot.className = 'w-1.5 h-1.5 rounded-full bg-on-surface-variant';
        }
    }
    updateBotUI(!!(data.botStatus && data.botStatus.running));

    // -------------------------------------------------------------
    // Controls Tab Handlers
    // -------------------------------------------------------------
    els.leverageRange.addEventListener('input', (e) => els.leverageVal.innerText = `${e.target.value}x`);
    els.riskRange.addEventListener('input', (e) => els.riskVal.innerText = `${e.target.value}%`);
    
    els.btnSaveRisk.addEventListener('click', async () => {
        await chrome.storage.local.set({
            settings: { 
                leverage: els.leverageRange.value, 
                risk: els.riskRange.value 
            }
        });
        els.btnSaveRisk.innerText = "Saved!";
        setTimeout(() => els.btnSaveRisk.innerText = "Save Settings", 2000);
    });

    els.btnStartBot.addEventListener('click', async () => {
        if (!licenseActive) return alert("Valid License Required!");
        if (!els.apiKey.value) return alert("Configure API Keys first.");
        await chrome.storage.local.set({ botStatus: { running: true } });
        chrome.runtime.sendMessage({ action: "start_bot" });
        updateBotUI(true);
    });

    els.btnStopBot.addEventListener('click', async () => {
        await chrome.storage.local.set({ botStatus: { running: false } });
        chrome.runtime.sendMessage({ action: "stop_bot" });
        updateBotUI(false);
    });

    els.btnKillSession.addEventListener('click', () => {
        if(confirm("Are you sure you want to market close EVERYTHING?")) {
            chrome.runtime.sendMessage({ action: "kill_session" });
            els.btnKillSession.innerText = "CLOSING POSITIONS...";
            setTimeout(() => els.btnKillSession.innerText = "FORCED CLOSE EVERYTHING", 3000);
        }
    });

    // -------------------------------------------------------------
    // Settings & License
    // -------------------------------------------------------------
    els.btnSaveApi.addEventListener('click', async () => {
        await chrome.storage.local.set({
            api: {
                key: els.apiKey.value,
                secret: els.apiSecret.value,
                workerUrl: els.workerUrl.value,
                testnet: els.testnetToggle.checked
            }
        });
        els.btnSaveApi.innerText = "Saved!";
        setTimeout(() => els.btnSaveApi.innerText = "SAVE CREDENTIALS", 2000);
    });

    els.btnValidateLicense.addEventListener('click', async () => {
        const txHash = els.txHashInput.value.trim();
        const workerUrl = els.workerUrl.value.trim();
        if (!txHash) return alert("Enter TxHash or Master Key");
        if (!workerUrl) return alert("Enter Cloudflare Worker URL in API settings first.");

        els.btnValidateLicense.innerText = "Verifying...";
        try {
            const res = await fetch(`${workerUrl}/verify-payment`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ txHash })
            });
            const text = await res.json();
            
            if (res.ok && text.license && text.license.active) {
                licenseActive = true;
                els.licenseBadge.classList.remove('hidden');
                els.licenseStatusTxt.innerText = "Subscription Active! (Expires: " + new Date(text.license.expiry).toLocaleDateString() + ")";
                els.licenseStatusTxt.className = "text-[11px] font-semibold mt-3 text-center text-secondary";
                await chrome.storage.local.set({ license: text.license, licenseKey: text.licenseKey });
            } else {
                throw new Error("Invalid TxHash or Subscription.");
            }
        } catch (e) {
            els.licenseStatusTxt.innerText = "Verification Failed: " + e.message;
            els.licenseStatusTxt.className = "text-[11px] font-semibold mt-3 text-center text-error";
            els.licenseStatusTxt.classList.remove('hidden');
        }
        els.btnValidateLicense.innerText = "Verify Transaction";
    });

    // -------------------------------------------------------------
    // Chat with Gemini
    // -------------------------------------------------------------
    els.btnSendChat.addEventListener('click', sendChat);
    els.chatInput.addEventListener('keypress', (e) => { if(e.key==='Enter') sendChat() });

    async function sendChat() {
        const q = els.chatInput.value.trim();
        if(!q) return;
        const workerUrl = els.workerUrl.value.trim();
        if (!workerUrl) return alert("Configure Worker URL in settings.");

        // Append User Message
        const userHtml = `<div class="flex flex-col items-end w-full">
            <span class="text-on-surface-variant text-[10px] mr-1 mb-1 font-bold">You</span>
            <div class="bg-primary-container text-on-primary-container px-3 py-2.5 rounded-2xl rounded-tr-sm text-[13px] inline-block shadow-sm">
              ${q.replace(/</g, "&lt;")}
            </div>
        </div>`;
        els.chatLog.insertAdjacentHTML('beforeend', userHtml);
        els.chatInput.value = "";
        els.chatLog.scrollTop = els.chatLog.scrollHeight;

        // Fetch from proxy
        try {
            const res = await fetch(`${workerUrl}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: q })
            });
            const data = await res.json();
            
            let replyText = "Error communicating with AI.";
            if (data.reply) replyText = data.reply;

            const botHtml = `<div class="flex flex-col items-start max-w-[85%] mt-4">
                <span class="text-on-surface-variant text-[10px] ml-1 mb-1 font-bold">Nexus AI</span>
                <div class="bg-surface-container-high px-3 py-2.5 rounded-2xl rounded-tl-sm text-on-surface text-[13px] border border-surface-container-highest leading-relaxed">
                  ${replyText.replace(/\n/g, '<br/>')}
                </div>
            </div>`;
            els.chatLog.insertAdjacentHTML('beforeend', botHtml);
            els.chatLog.scrollTop = els.chatLog.scrollHeight;
        } catch (e) {
            console.error(e);
        }
    }

    // -------------------------------------------------------------
    // Dashboard Realtime Fetch
    // -------------------------------------------------------------
    els.refreshBtn.addEventListener('click', fetchDashboardData);
    
    // Auto-fetch every 5 seconds if visible
    let fetchInterval = setInterval(() => { if (!document.hidden) fetchDashboardData(); }, 5000);
    fetchDashboardData();

    async function fetchDashboardData() {
        const response = await new Promise(res => {
            chrome.runtime.sendMessage({ action: "get_dashboard_data" }, res);
        });

        if (!response || response.error) {
            console.log("Dashboard fetch problem:", response ? response.error : "Unknown");
            return;
        }

        if (response.account) {
            els.totalEqText.innerText = `$${parseFloat(response.account.totalMarginBalance).toFixed(2)}`;
            let upnl = parseFloat(response.account.totalUnrealizedProfit);
            els.upnlText.innerText = `${upnl >= 0 ? '+' : ''}$${upnl.toFixed(2)}`;
            els.upnlText.className = upnl >= 0 ? "text-secondary text-[14px] font-bold" : "text-error text-[14px] font-bold";
        }

        if (response.positions) {
            // clear old rows
            document.querySelectorAll('.pos-row').forEach(e => e.remove());
            const hasActive = response.positions.filter(p => parseFloat(p.positionAmt) !== 0);
            
            if (hasActive.length > 0) {
                els.noPositionsMsg.classList.add('hidden');
                hasActive.forEach(p => {
                    const size = parseFloat(p.positionAmt);
                    const isLong = size > 0;
                    const pnl = parseFloat(p.unRealizedProfit);
                    const colorGrp = isLong ? 'secondary' : 'error';
                    
                    const row = document.createElement('div');
                    row.className = `pos-row grid grid-cols-3 px-4 py-3 hover:bg-surface-bright transition-colors cursor-pointer`;
                    row.innerHTML = `
                        <div class="flex flex-col">
                            <span class="text-on-surface text-[12px] font-bold">${p.symbol}</span>
                            <span class="text-${colorGrp} text-[9px] font-bold">${isLong ? 'LONG':'SHORT'} ${p.leverage}x</span>
                        </div>
                        <div class="flex items-center justify-end">
                            <span class="text-on-surface text-[12px] font-medium">${Math.abs(size)}</span>
                        </div>
                        <div class="flex flex-col items-end">
                            <span class="text-${colorGrp} text-[12px] font-black">${pnl >= 0 ? '+':''}$${pnl.toFixed(2)}</span>
                            <span class="text-${colorGrp}/60 text-[9px] font-bold">Eq: ${(pnl/parseFloat(response.account.totalWalletBalance)*100).toFixed(2)}%</span>
                        </div>
                    `;
                    els.positionsTable.appendChild(row);
                });
            } else {
                els.noPositionsMsg.classList.remove('hidden');
            }
        }
    }
});
