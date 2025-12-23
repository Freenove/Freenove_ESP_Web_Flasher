// 导入esptool-integration.js中导出的所有功能函数和对象
import { connectToDevice, disconnectDevice, startFlashing, getSerialPortInfo, getConnectedPort, consoleTerminal, fitAddon, changeBaudRate, serialMonitorTerminal, monitorFitAddon, startSerialMonitor, stopSerialMonitor, sendSerialData, clearSerialTerminal } from './esptool-integration.js';

// 等待DOM内容完全加载后再执行脚本
document.addEventListener('DOMContentLoaded', () => {
    // --- DOM元素引用 ---
    const body = document.body;
    const selectDeviceBtn = document.getElementById('select-device-btn');
    const firmwareSelect = document.getElementById('firmware-select');
    const versionSelect = document.getElementById('version-select');
    const connectBtn = document.getElementById('connect-btn');
    const flashBtn = document.getElementById('flash-btn');
    const toggleConsoleBtn = document.getElementById('toggle-console-btn');
    const serialPortInfoBtn = document.getElementById('serial-port-info-btn');
    const themeSwitcher = document.getElementById('theme-switcher');
    const baudRateSelect = document.getElementById('baud-rate-select');
    const terminalSection = document.querySelector('.terminal-section');

    // 模态框元素
    const deviceModal = document.getElementById('device-modal');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const deviceList = document.getElementById('device-list');
    const leftArrow = document.querySelector('.left-arrow');
    const rightArrow = document.querySelector('.right-arrow');

    // 串口信息模态框元素
    const serialInfoModal = document.getElementById('serial-info-modal');
    const closeSerialInfoModalBtn = document.getElementById('close-serial-info-modal-btn');
    const modalBaudRateSelect = document.getElementById('modal-baud-rate-select');
    const clearTerminalBtn = document.getElementById('clear-terminal-btn');
    // 新增：发送区域元素
    const serialSendInput = document.getElementById('serial-send-input');
    const serialSendBtn = document.getElementById('serial-send-btn');

    // 步骤指示器元素
    const step2 = document.getElementById('step-2');
    const step3 = document.getElementById('step-3');

    // --- 应用程序状态变量 ---
    let appConfig = null;
    let selectedDevice = null;
    let selectedFirmware = null;
    let selectedVersion = null;
    let isConnected = false;

    // --- 功能函数 ---

    // 将串口监视器终端附加到指定的DOM元素
    const serialMonitorTerminalElement = document.getElementById('serial-monitor-terminal');
    serialMonitorTerminal.open(serialMonitorTerminalElement);


    function toggleModal(modalElement) {
        modalElement.classList.toggle('is-visible');
    }
    
    function renderDeviceCarousel() {
        if (!appConfig || !appConfig.devices) {
            console.error("Configuration not loaded or has no devices.");
            return;
        }
        deviceList.innerHTML = '';
        appConfig.devices.forEach(device => {
            const item = document.createElement('div');
            item.className = 'device-item';
            item.dataset.deviceId = device.id;
            item.innerHTML = `
                <div class="device-image-wrapper">
                    <img src="${device.image || 'freenove.ico'}" alt="${device.name}" class="device-image-placeholder" />
                </div>
                <span class="device-name">${device.name}</span>
            `;
            item.addEventListener('click', () => handleDeviceSelection(device));
            deviceList.appendChild(item);
        });
    }

    function handleDeviceSelection(device) {
        selectedDevice = device;
        selectedFirmware = null;
        selectedVersion = null;
        
        selectDeviceBtn.innerHTML = `<span>${device.name}</span>`;
        selectDeviceBtn.classList.add('selected');

        if (device.firmwares && device.firmwares.length > 0) {
            populateDropdown(firmwareSelect, device.firmwares, 'Select firmware');
            firmwareSelect.disabled = false;
            step2.classList.add('active');
        } else {
            populateDropdown(firmwareSelect, [], 'No firmware available');
            populateDropdown(versionSelect, [], 'Select version');
            firmwareSelect.disabled = true;
            versionSelect.disabled = true;
            step2.classList.remove('active');
            step3.classList.remove('active');
        }
        
        populateDropdown(versionSelect, [], 'Select version');
        versionSelect.disabled = true;
        step3.classList.remove('active');
        
        updateButtonStates();
        toggleModal(deviceModal);
    }
    
    function populateDropdown(selectElement, items, placeholder) {
        selectElement.innerHTML = `<option value="">${placeholder}</option>`;
        items.forEach(item => {
            const option = document.createElement('option');
            option.value = item.id;
            option.textContent = item.name;
            selectElement.appendChild(option);
        });
    }

    /**
     * 更新按钮状态
     * 逻辑更改:
     * 1. Connect按钮始终可用 (除非正在连接/断开中)。
     * 2. Monitor按钮在连接成功后即可用。
     * 3. Flash按钮仅在 连接成功 + 设备/固件/版本已选 时可用。
     */
    function updateButtonStates() {
        const canFlash = selectedDevice && selectedFirmware && selectedVersion;
        
        // 连接按钮逻辑 (主要由isConnected状态控制文本，点击事件本身处理disabled)
        if (isConnected) {
            connectBtn.innerHTML = '<i class="fas fa-unlink"></i> Disconnect';
        } else {
            connectBtn.innerHTML = '<i class="fas fa-link"></i> Connect';
        }

        // 烧录按钮状态
        flashBtn.disabled = !(isConnected && canFlash);

        // 串口监视器按钮状态
        serialPortInfoBtn.disabled = !isConnected;
    }

    // --- 主题切换功能 ---
    function setTheme(theme) {
        localStorage.setItem('theme', theme);
        body.className = theme === 'light' ? 'light-mode' : '';
        themeSwitcher.innerHTML = theme === 'light' ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
    }

    function loadTheme() {
        const savedTheme = localStorage.getItem('theme');
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (savedTheme) {
            setTheme(savedTheme);
        } else if (prefersDark) {
            setTheme('dark');
        } else {
            setTheme('light');
        }
    }

    // --- 事件监听器 ---

    window.addEventListener('resize', () => {
        if (serialInfoModal.classList.contains('is-visible')) {
            monitorFitAddon.fit();
        }
        fitAddon.fit();
    });

    navigator.serial.addEventListener('disconnect', async (event) => {
        // 简化处理：任何断开都视为设备断开
        if (isConnected) {
            isConnected = false;
            await disconnectDevice();
            consoleTerminal.writeLine("Device disconnected (Event).");
            updateButtonStates();
        }
    });

    selectDeviceBtn.addEventListener('click', () => toggleModal(deviceModal));
    closeModalBtn.addEventListener('click', () => toggleModal(deviceModal));
    deviceModal.addEventListener('click', (e) => {
        if (e.target === deviceModal) toggleModal(deviceModal);
    });

    // 关闭串口监视器模态框
    closeSerialInfoModalBtn.addEventListener('click', () => {
        toggleModal(serialInfoModal);
    });
    serialInfoModal.addEventListener('click', (e) => {
        if (e.target === serialInfoModal) {
            toggleModal(serialInfoModal);
        }
    });

    themeSwitcher.addEventListener('click', () => {
        const currentTheme = body.classList.contains('light-mode') ? 'light' : 'dark';
        setTheme(currentTheme === 'light' ? 'dark' : 'light');
    });

    leftArrow.addEventListener('click', () => {
        deviceList.scrollBy({ left: -300, behavior: 'smooth' });
    });
    rightArrow.addEventListener('click', () => {
        deviceList.scrollBy({ left: 300, behavior: 'smooth' });
    });

    firmwareSelect.addEventListener('change', () => {
        const firmwareId = firmwareSelect.value;
        selectedFirmware = selectedDevice?.firmwares.find(f => f.id === firmwareId) || null;
        selectedVersion = null;

        if (selectedFirmware && selectedFirmware.versions && selectedFirmware.versions.length > 0) {
            populateDropdown(versionSelect, selectedFirmware.versions, 'Select version');
            versionSelect.disabled = false;
            step3.classList.add('active');
        } else {
            populateDropdown(versionSelect, [], 'No versions available');
            versionSelect.disabled = true;
            step3.classList.remove('active');
        }
        updateButtonStates();
    });

    versionSelect.addEventListener('change', () => {
        const versionId = versionSelect.value;
        selectedVersion = selectedFirmware?.versions.find(v => v.id === versionId) || null;
        updateButtonStates();
    });

    // 连接按钮点击事件
    connectBtn.addEventListener('click', async () => {
        // 连接时使用监视器设定的波特率 (默认 115200)
        const monitorBaudRate = parseInt(modalBaudRateSelect.value);
        if (!isConnected) {
            // 连接阶段
            connectBtn.disabled = true;
            connectBtn.textContent = 'Connecting...';
            try {
                // 调用新的连接函数 (纯串口连接，不复位)
                await connectToDevice(monitorBaudRate);
                isConnected = true;
            } catch (error) {
                isConnected = false;
            } finally {
                connectBtn.disabled = false;
                updateButtonStates();
            }
        } else {
            // 断开连接阶段
            connectBtn.disabled = true;
            connectBtn.textContent = 'Disconnecting...';
            try {
                await disconnectDevice();
                isConnected = false;
            } catch (error) {
                console.error("断开连接失败:", error);
            } finally {
                connectBtn.disabled = false;
                updateButtonStates();
            }
        }
    });

    // 烧录按钮点击事件
    flashBtn.addEventListener('click', async () => {
        if (!isConnected) return; // 理论上disabled属性已阻止，但双重保险

        flashBtn.disabled = true;
        connectBtn.disabled = true;
        serialPortInfoBtn.disabled = true;
        flashBtn.textContent = 'Flashing...';
        
        const eraseFlashCheckbox = document.getElementById('erase-flash-checkbox');
        const shouldEraseFlash = eraseFlashCheckbox ? eraseFlashCheckbox.checked : false;
        const flashBaudRate = parseInt(baudRateSelect.value); // 获取主界面的烧录波特率

        try {
            // startFlashing 现在会处理 停止监视 -> 烧录 -> 恢复监视 的全流程
            await startFlashing(selectedVersion, shouldEraseFlash, flashBaudRate);
            // 烧录成功，状态保持为已连接
        } catch (error) {
            // 烧录失败，尝试恢复连接状态 (startFlashing内部已尝试恢复，这里主要处理UI)
            // 如果startFlashing抛出错误，说明恢复连接也可能失败了，或者烧录中途出错
            // 我们可以检查 getConnectedPort() 是否还有值
            if (!getConnectedPort()) {
                isConnected = false;
            }
        } finally {
            flashBtn.disabled = false;
            connectBtn.disabled = false; // 恢复连接按钮可用
            flashBtn.innerHTML = '<i class="fas fa-bolt"></i> Flash';
            // 重新计算按钮状态 (如果恢复连接成功，Connect按钮应显示Disconnect)
            updateButtonStates();
        }
    });

    toggleConsoleBtn.addEventListener('click', () => {
        terminalSection.classList.toggle('hidden');
        if (terminalSection.classList.contains('hidden')) {
            toggleConsoleBtn.innerHTML = '<i class="fas fa-terminal"></i> Open Console';
        } else {
            toggleConsoleBtn.innerHTML = '<i class="fas fa-terminal"></i> Close Console';
            fitAddon.fit();
        }
    });

    // 串口监视器按钮点击事件
    serialPortInfoBtn.addEventListener('click', async () => {
        if (!isConnected) return;

        toggleModal(serialInfoModal);
        
        // 调整终端大小
        setTimeout(() => monitorFitAddon.fit(), 100);
        
        // 注意：现在监视器是自动运行的，不需要手动点击Start
    });
    
    // 监视器内波特率改变
    modalBaudRateSelect.addEventListener('change', async () => {
        if(isConnected) {
            const newRate = parseInt(modalBaudRateSelect.value);
            await changeBaudRate(newRate);
        }
    });

    // 清空终端按钮
    clearTerminalBtn.addEventListener('click', () => {
        clearSerialTerminal();
    });

    // 串口发送按钮
    serialSendBtn.addEventListener('click', async () => {
        const text = serialSendInput.value;
        if (text) {
            await sendSerialData(text + '\r\n');
            serialSendInput.value = ''; // 清空输入框
        }
    });

    // 串口发送输入框回车事件
    serialSendInput.addEventListener('keypress', async (e) => {
        if (e.key === 'Enter') {
            const text = serialSendInput.value;
            if (text) {
                await sendSerialData(text + '\r\n'); // 默认不发送换行符，如果需要可以加上 + '\r\n'
                serialSendInput.value = '';
            }
        }
    });


    async function initializeApp() {
        loadTheme();
        try {
            const response = await fetch('firmware/config.json');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            appConfig = await response.json();
            renderDeviceCarousel();
            updateButtonStates();
        } catch (error) {
            console.error('Failed to load or parse firmware/config.json:', error);
            consoleTerminal.writeLine('Fatal Error: Could not load device configuration. Please check the console.');
        }
    }
	
	const infoWidget = document.getElementById('info-widget');
	const infoTriggerBtn = document.getElementById('info-trigger-btn');
	const infoCloseBtn = document.getElementById('info-close-btn');

	if (infoWidget && infoTriggerBtn && infoCloseBtn) {
		infoTriggerBtn.addEventListener('click', () => {
			infoWidget.classList.add('expanded');
		});

		infoCloseBtn.addEventListener('click', () => {
			infoWidget.classList.remove('expanded');
		});
	}

    initializeApp();
});