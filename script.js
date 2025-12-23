// 导入esptool-integration.js中导出的所有功能函数和对象
import { initESPLoader, disconnectESPLoader, startFlashing, getSerialPortInfo, getConnectedPort, consoleTerminal, fitAddon, changeBaudRate, serialMonitorTerminal, monitorFitAddon, startSerialMonitor, stopSerialMonitor } from './esptool-integration.js';

// 等待DOM内容完全加载后再执行脚本
document.addEventListener('DOMContentLoaded', () => {
    // --- DOM元素引用 ---
    const body = document.body; // 页面主体元素
    const selectDeviceBtn = document.getElementById('select-device-btn'); // 选择设备按钮
    const firmwareSelect = document.getElementById('firmware-select'); // 固件选择下拉框
    const versionSelect = document.getElementById('version-select'); // 版本选择下拉框
    const connectBtn = document.getElementById('connect-btn'); // 连接按钮
    const flashBtn = document.getElementById('flash-btn'); // 烧录按钮
    const toggleConsoleBtn = document.getElementById('toggle-console-btn'); // 切换控制台显示按钮
    const serialPortInfoBtn = document.getElementById('serial-port-info-btn'); // 串口监视器按钮
    const themeSwitcher = document.getElementById('theme-switcher'); // 主题切换按钮
    const baudRateSelect = document.getElementById('baud-rate-select'); // 波特率选择下拉框
    const terminalSection = document.querySelector('.terminal-section'); // 主终端显示区域

    // 模态框元素
    const deviceModal = document.getElementById('device-modal'); // 设备选择模态框
    const closeModalBtn = document.getElementById('close-modal-btn'); // 关闭设备选择模态框按钮
    const deviceList = document.getElementById('device-list'); // 设备列表容器
    const leftArrow = document.querySelector('.left-arrow'); // 设备轮播左箭头
    const rightArrow = document.querySelector('.right-arrow'); // 设备轮播右箭头

    // 串口信息模态框元素
    const serialInfoModal = document.getElementById('serial-info-modal'); // 串口监视器模态框
    const closeSerialInfoModalBtn = document.getElementById('close-serial-info-modal-btn'); // 关闭串口监视器模态框按钮
    const serialVendorId = document.getElementById('serial-vendor-id'); // 串口供应商ID显示元素 (HTML中可能未实际使用，但保留引用)
    const serialProductId = document.getElementById('serial-product-id'); // 串口产品ID显示元素 (HTML中可能未实际使用，但保留引用)
    const serialBaudRateDisplay = document.getElementById('serial-baud-rate'); // 串口波特率显示元素 (HTML中可能未实际使用，但保留引用)
    const modalBaudRateSelect = document.getElementById('modal-baud-rate-select'); // 串口监视器模态框内的波特率选择下拉框
    const toggleMonitorBtn = document.getElementById('toggle-monitor-btn'); // 启动/停止串口监视按钮

    // 步骤指示器元素
    const step2 = document.getElementById('step-2'); // 步骤2 (选择固件)
    const step3 = document.getElementById('step-3'); // 步骤3 (选择版本)

    // --- 应用程序状态变量 ---
    let appConfig = null; // 存储从config.json加载的应用程序配置
    let selectedDevice = null; // 当前选中的设备对象
    let selectedFirmware = null; // 当前选中的固件对象
    let selectedVersion = null; // 当前选中的固件版本对象
    let isConnected = false; // 串口连接状态
    let isMonitoring = false; // 串口监视状态

    // --- 功能函数 ---

    // 将串口监视器终端附加到指定的DOM元素
    const serialMonitorTerminalElement = document.getElementById('serial-monitor-terminal');
    serialMonitorTerminal.open(serialMonitorTerminalElement);


    /**
     * 切换模态框的显示状态。
     * @param {HTMLElement} modalElement - 要切换显示状态的模态框DOM元素。
     */
    function toggleModal(modalElement) {
        modalElement.classList.toggle('is-visible'); // 切换'is-visible'类以控制模态框显示/隐藏
        
    }
    
    /**
     * 根据appConfig中的设备数据渲染设备轮播列表。
     */
    function renderDeviceCarousel() {
        if (!appConfig || !appConfig.devices) {
            console.error("Configuration not loaded or has no devices."); // 错误日志：配置未加载或无设备数据
            return;
        }
        deviceList.innerHTML = ''; // 清空现有设备列表
        appConfig.devices.forEach(device => {
            const item = document.createElement('div'); // 为每个设备创建DOM元素
            item.className = 'device-item';
            item.dataset.deviceId = device.id; // 存储设备ID
            item.innerHTML = `
                <div class="device-image-wrapper">
                    <img src="${device.image || 'freenove.ico'}" alt="${device.name}" class="device-image-placeholder" />
                </div>
                <span class="device-name">${device.name}</span>
            `;
            item.addEventListener('click', () => handleDeviceSelection(device)); // 添加点击事件处理器
            deviceList.appendChild(item); // 将设备项添加到列表中
        });
    }

    /**
     * 处理设备选择事件，更新UI状态和下拉框内容。
     * @param {object} device - 选中的设备对象。
     */
    function handleDeviceSelection(device) {
        
        selectedDevice = device; // 更新选中的设备
        selectedFirmware = null; // 重置固件选择
        selectedVersion = null; // 重置版本选择
        
        selectDeviceBtn.innerHTML = `<span>${device.name}</span>`; // 更新设备选择按钮文本
        selectDeviceBtn.classList.add('selected'); // 添加选中样式

        // 根据设备是否有固件来填充固件下拉框
        if (device.firmwares && device.firmwares.length > 0) {
            populateDropdown(firmwareSelect, device.firmwares, 'Select firmware'); // 填充固件下拉框
            firmwareSelect.disabled = false; // 启用固件下拉框
            step2.classList.add('active'); // 激活步骤2
        } else {
            populateDropdown(firmwareSelect, [], 'No firmware available'); // 显示无固件信息
            populateDropdown(versionSelect, [], 'Select version'); // 清空版本下拉框
            firmwareSelect.disabled = true; // 禁用固件下拉框
            versionSelect.disabled = true; // 禁用版本下拉框
            step2.classList.remove('active'); // 取消激活步骤2
            step3.classList.remove('active'); // 取消激活步骤3
        }
        
        populateDropdown(versionSelect, [], 'Select version'); // 清空版本下拉框
        versionSelect.disabled = true; // 禁用版本下拉框
        step3.classList.remove('active'); // 取消激活步骤3
        
        updateButtonStates(); // 更新按钮状态
        toggleModal(deviceModal); // 关闭设备选择模态框
    }
    
    /**
     * 填充下拉框 (select元素) 的选项。
     * @param {HTMLSelectElement} selectElement - 下拉框DOM元素。
     * @param {Array<object>} items - 包含id和name属性的选项数组。
     * @param {string} placeholder - 默认的占位文本。
     */
    function populateDropdown(selectElement, items, placeholder) {
        selectElement.innerHTML = `<option value="">${placeholder}</option>`; // 设置占位符选项
        items.forEach(item => {
            const option = document.createElement('option');
            option.value = item.id; // 选项值设为item的id
            option.textContent = item.name; // 选项文本设为item的name
            selectElement.appendChild(option); // 添加选项到下拉框
        });
    }

    /**
     * 根据当前连接和选择状态更新操作按钮的可用性。
     */
    function updateButtonStates() {
        console.log("updateButtonStates called."); // 调试日志：函数调用
        console.log("Current isConnected:", isConnected); // 调试日志：当前连接状态
        const canFlash = selectedDevice && selectedFirmware && selectedVersion; // 判断是否可烧录
        console.log("Current canFlash:", canFlash); // 调试日志：是否可烧录
        
        // 连接/断开按钮状态
        connectBtn.disabled = !canFlash; // 在设备、固件、版本全部选择前禁用
        if (isConnected) {
            connectBtn.innerHTML = '<i class="fas fa-unlink"></i> Disconnect'; // 已连接则显示断开按钮
        } else {
            connectBtn.innerHTML = '<i class="fas fa-link"></i> Connect'; // 未连接则显示连接按钮
        }
        console.log("Connect button disabled:", connectBtn.disabled); // 调试日志：连接按钮禁用状态

        // 烧录按钮状态
        flashBtn.disabled = !(isConnected && canFlash); // 仅在连接且所有选择完成时启用
        console.log("Flash button disabled:", flashBtn.disabled); // 调试日志：烧录按钮禁用状态

        // 串口监视器按钮状态
        serialPortInfoBtn.disabled = !isConnected; // 仅在连接时启用
        console.log("Serial Port Info button disabled:", serialPortInfoBtn.disabled); // 调试日志：串口监视器按钮禁用状态
    }

    // --- 主题切换功能 ---
    /**
     * 设置应用程序主题 (深色/浅色)。
     * @param {string} theme - 'light' 或 'dark'。
     */
    function setTheme(theme) {
        localStorage.setItem('theme', theme); // 将主题偏好存储到localStorage
        body.className = theme === 'light' ? 'light-mode' : ''; // 根据主题切换body的类名
        themeSwitcher.innerHTML = theme === 'light' ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>'; // 切换主题图标
    }

    /**
     * 从localStorage加载主题，或根据系统偏好设置默认主题。
     */
    function loadTheme() {
        const savedTheme = localStorage.getItem('theme'); // 获取保存的主题
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches; // 检查系统是否偏好深色模式
        if (savedTheme) {
            setTheme(savedTheme); // 使用保存的主题
        } else if (prefersDark) {
            setTheme('dark'); // 如果系统偏好深色模式，设置深色主题
        } else {
            setTheme('light'); // 否则设置浅色主题
        }
    }

    // --- 事件监听器 ---

    // 监听窗口大小变化事件，调整终端显示
    window.addEventListener('resize', () => {
        if (serialInfoModal.classList.contains('is-visible')) {
            monitorFitAddon.fit(); // 如果串口监视器模态框可见，调整其终端大小
        }
        fitAddon.fit(); // 调整主终端大小
    });

    // 监听串口断开连接事件
    navigator.serial.addEventListener('disconnect', async (event) => {
        console.log("Disconnect event fired."); // 调试日志：断开连接事件触发
        const connectedPort = getConnectedPort(); // 获取当前连接的串口对象
        console.log("Connected Port (from getConnectedPort):", connectedPort); // 调试日志：已连接的串口
        console.log("Event Port:", event.port); // 调试日志：事件中的串口

        let isOurPortDisconnected = false; // 标志位：是否是我们的串口断开连接

        if (event.port) {
            // 如果事件包含port信息，尝试通过Vendor/Product ID匹配
            if (connectedPort) {
                const connectedPortInfo = await getSerialPortInfo(); // 获取已连接串口的详细信息
                console.log("Connected Port Info:", connectedPortInfo); // 调试日志：已连接串口信息
                console.log("Event Port Vendor ID:", event.port.usbVendorId); // 调试日志：事件串口Vendor ID
                console.log("Event Port Product ID:", event.port.usbProductId); // 调试日志：事件串口Product ID

                if (connectedPortInfo && event.port.usbVendorId && event.port.usbProductId &&
                    connectedPortInfo.usbVendorId === `0x${event.port.usbVendorId.toString(16).padStart(4, '0')}` &&
                    connectedPortInfo.usbProductId === `0x${event.port.usbProductId.toString(16).padStart(4, '0')}`) {
                    isOurPortDisconnected = true; // 匹配成功，是我们的串口断开
                }
            }
        } else {
            // 如果事件不包含port信息，假设是我们连接的串口断开
            console.log("Event Port is undefined. Assuming our port disconnected if isConnected is true."); // 调试日志：事件串口未定义，假设是我们的串口断开
            if (isConnected) {
                isOurPortDisconnected = true;
            }
        }

        if (isOurPortDisconnected) {
            isConnected = false; // 更新连接状态
            disconnectESPLoader(); // 调用ESPLoader的断开连接函数
            consoleTerminal.writeLine("Device disconnected."); // 向控制台输出断开连接信息
            updateButtonStates(); // 更新按钮状态
        } else {
            console.log("Disconnect event: Conditions for port match not met or event.port undefined and not connected."); // 调试日志：断开连接事件条件不满足
        }
    });

    // 选择设备按钮点击事件：打开设备选择模态框
    selectDeviceBtn.addEventListener('click', () => toggleModal(deviceModal));
    // 关闭设备选择模态框按钮点击事件
    closeModalBtn.addEventListener('click', () => toggleModal(deviceModal));
    // 点击模态框背景区域时关闭设备选择模态框
    deviceModal.addEventListener('click', (e) => {
        if (e.target === deviceModal) toggleModal(deviceModal);
    });

    // 关闭串口监视器模态框按钮点击事件
    closeSerialInfoModalBtn.addEventListener('click', () => {
        if (isMonitoring) {
            stopSerialMonitor(); // 如果正在监视，则停止
            isMonitoring = false; // 更新监视状态
            toggleMonitorBtn.textContent = 'Start Monitor'; // 恢复按钮文本
        }
        toggleModal(serialInfoModal); // 关闭模态框
    });
    // 点击串口监视器模态框背景区域时关闭
    serialInfoModal.addEventListener('click', (e) => {
        if (e.target === serialInfoModal) {
            if (isMonitoring) {
                stopSerialMonitor(); // 如果正在监视，则停止
                isMonitoring = false; // 更新监视状态
                toggleMonitorBtn.textContent = 'Start Monitor'; // 恢复按钮文本
            }
            toggleModal(serialInfoModal); // 关闭模态框
        }
    });

    // 主题切换器点击事件
    themeSwitcher.addEventListener('click', () => {
        const currentTheme = body.classList.contains('light-mode') ? 'light' : 'dark'; // 获取当前主题
        const newTheme = currentTheme === 'light' ? 'dark' : 'light'; // 计算新主题
        setTheme(newTheme); // 设置新主题
    });

    // 设备轮播左箭头点击事件
    leftArrow.addEventListener('click', () => {
        deviceList.scrollBy({ left: -300, behavior: 'smooth' }); // 向左平滑滚动
    });
    // 设备轮播右箭头点击事件
    rightArrow.addEventListener('click', () => {
        deviceList.scrollBy({ left: 300, behavior: 'smooth' }); // 向右平滑滚动
    });

    // 固件选择下拉框变更事件
    firmwareSelect.addEventListener('change', () => {
        const firmwareId = firmwareSelect.value; // 获取选中的固件ID
        selectedFirmware = selectedDevice?.firmwares.find(f => f.id === firmwareId) || null; // 查找对应固件对象
        selectedVersion = null; // 重置版本选择

        // 根据固件是否有版本来填充版本下拉框
        if (selectedFirmware && selectedFirmware.versions && selectedFirmware.versions.length > 0) {
            populateDropdown(versionSelect, selectedFirmware.versions, 'Select version'); // 填充版本下拉框
            versionSelect.disabled = false; // 启用版本下拉框
            step3.classList.add('active'); // 激活步骤3
        } else {
            populateDropdown(versionSelect, [], 'No versions available'); // 显示无版本信息
            versionSelect.disabled = true; // 禁用版本下拉框
            step3.classList.remove('active'); // 取消激活步骤3
        }
        updateButtonStates(); // 更新按钮状态
    });

    // 版本选择下拉框变更事件
    versionSelect.addEventListener('change', () => {
        const versionId = versionSelect.value; // 获取选中的版本ID
        selectedVersion = selectedFirmware?.versions.find(v => v.id === versionId) || null; // 查找对应版本对象
        updateButtonStates(); // 更新按钮状态
    });

    // 连接按钮点击事件
    connectBtn.addEventListener('click', async () => {
        const selectedBaudRate = parseInt(baudRateSelect.value); // 获取选中的波特率
        if (!isConnected) {
            // 连接阶段
            connectBtn.disabled = true; // 禁用连接按钮
            connectBtn.textContent = 'Connecting...'; // 更新按钮文本
            try {
                await initESPLoader(selectedBaudRate); // 初始化ESPLoader并尝试连接
                isConnected = true; // 更新连接状态
                consoleTerminal.writeLine("Device connected."); // 向控制台输出连接成功信息
            } catch (error) {
                console.error("连接失败:", error); // 错误日志：连接失败
                consoleTerminal.writeLine("Connection failed: " + error.message); // 向控制台输出连接失败信息
                isConnected = false; // 更新连接状态
            } finally {
                connectBtn.disabled = false; // 重新启用连接按钮
                updateButtonStates(); // 更新按钮状态
            }
        } else {
            // 断开连接阶段
            if (isMonitoring) {
                await stopSerialMonitor(); // 如果正在监视，则停止监视
                isMonitoring = false; // 更新监视状态
                toggleMonitorBtn.textContent = 'Start Monitor'; // 恢复监视按钮文本
            }
            connectBtn.disabled = true; // 禁用连接按钮
            connectBtn.textContent = 'Disconnecting...'; // 更新按钮文本
            try {
                await disconnectESPLoader(); // 断开ESPLoader连接
                isConnected = false; // 更新连接状态
                consoleTerminal.writeLine("Device disconnected."); // 向控制台输出断开连接信息
            } catch (error) {
                console.error("断开连接失败:", error); // 错误日志：断开连接失败
                consoleTerminal.writeLine("Disconnection failed: " + error.message); // 向控制台输出断开连接失败信息
            } finally {
                connectBtn.disabled = false; // 重新启用连接按钮
                updateButtonStates(); // 更新按钮状态
            }
        }
    });

    // 烧录按钮点击事件
    flashBtn.addEventListener('click', async () => {
        console.log("Flash button clicked."); // 调试日志：烧录按钮被点击
        flashBtn.disabled = true; // 禁用烧录按钮
        connectBtn.disabled = true; // 禁用连接按钮
        serialPortInfoBtn.disabled = true; // 禁用串口监视器按钮
        flashBtn.textContent = 'Flashing...'; // 更新烧录按钮文本
        const eraseFlashCheckbox = document.getElementById('erase-flash-checkbox'); // 获取擦除闪存复选框
        const shouldEraseFlash = eraseFlashCheckbox ? eraseFlashCheckbox.checked : false; // 获取复选框状态

        try {
            console.log("Starting flashing process..."); // 调试日志：开始烧录过程
            await startFlashing(selectedVersion, shouldEraseFlash); // 启动烧录过程
            isConnected = true; // 烧录完成后保持连接状态
            console.log("Flashing successful. isConnected:", isConnected); // 调试日志：烧录成功及连接状态
        } catch (error) {
            console.error("烧录失败:", error); // 错误日志：烧录失败
            console.log("Flashing failed. isConnected:", isConnected); // 调试日志：烧录失败及连接状态
        } finally {
            console.log("Flashing finally block executed."); // 调试日志：烧录finally块执行
            flashBtn.disabled = false; // 重新启用烧录按钮
            flashBtn.innerHTML = '<i class="fas fa-bolt"></i> Flash'; // 恢复烧录按钮图标和文本
            updateButtonStates(); // 更新按钮状态
            console.log("Flash button state updated."); // 调试日志：烧录按钮状态已更新
        }
    });

    // 切换控制台显示按钮点击事件
    toggleConsoleBtn.addEventListener('click', () => {
        terminalSection.classList.toggle('hidden'); // 切换终端区域的隐藏状态
        if (terminalSection.classList.contains('hidden')) {
            toggleConsoleBtn.innerHTML = '<i class="fas fa-terminal"></i> Open Console'; // 如果隐藏，显示“打开控制台”
        } else {
            toggleConsoleBtn.innerHTML = '<i class="fas fa-terminal"></i> Close Console'; // 如果显示，显示“关闭控制台”
            fitAddon.fit(); // 调整主终端大小以适应容器
        }
    });

    // 串口监视器按钮点击事件
    serialPortInfoBtn.addEventListener('click', async () => {
        if (!isConnected) return; // 未连接状态下不执行

        // 打开模态框
        toggleModal(serialInfoModal);
        
        // 清空并调整终端大小
        serialMonitorTerminal.clear();
        // 使用短时延时确保模态框完全可见后再调整终端大小，避免布局问题
        setTimeout(() => monitorFitAddon.fit(), 100);
    });

    // 启动/停止串口监视按钮点击事件
    toggleMonitorBtn.addEventListener('click', async () => {
        if (isMonitoring) {
            // 停止监视
            await stopSerialMonitor(); // 停止串口监视
            isMonitoring = false; // 更新监视状态
            toggleMonitorBtn.textContent = 'Start Monitor'; // 恢复按钮文本
            serialMonitorTerminal.writeln("\n[MONITOR] Stopped."); // 串口监视器终端输出停止信息
        } else {
            // 启动监视
            const newBaudRate = parseInt(modalBaudRateSelect.value); // 获取选中的波特率
            if (isConnected && newBaudRate) {
                try {
                    serialMonitorTerminal.writeln(`[MONITOR] Starting with baud rate ${newBaudRate}...`); // 串口监视器终端输出启动信息
                    await changeBaudRate(newBaudRate); // 改变串口波特率
                    await startSerialMonitor(); // 启动串口监视
                    isMonitoring = true; // 更新监视状态
                    toggleMonitorBtn.textContent = 'Stop Monitor'; // 更新按钮文本
                } catch (error) {
                    console.error("启动监视器失败:", error); // 错误日志：启动监视器失败
                    serialMonitorTerminal.writeln(`[MONITOR] Failed to start: ${error.message}`); // 串口监视器终端输出失败信息
                }
            }
        }
    });

    /**
     * 应用程序主初始化函数。
     * 加载主题、获取设备配置并渲染UI。
     */
    async function initializeApp() {
        loadTheme(); // 加载并设置主题
        try {
            const response = await fetch('firmware/config.json'); // 从服务器获取设备配置文件
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`); // HTTP错误处理
            }
            appConfig = await response.json(); // 解析JSON配置
            renderDeviceCarousel(); // 渲染设备轮播列表
            updateButtonStates(); // 更新按钮状态
        } catch (error) {
            console.error('Failed to load or parse firmware/config.json:', error); // 错误日志：加载或解析配置文件失败
            consoleTerminal.writeLine('Fatal Error: Could not load device configuration. Please check the console.'); // 向控制台输出致命错误信息
        }
    }
	
	// --- 功能说明悬浮组件逻辑 ---
	const infoWidget = document.getElementById('info-widget');
	const infoTriggerBtn = document.getElementById('info-trigger-btn');
	const infoCloseBtn = document.getElementById('info-close-btn');

	if (infoWidget && infoTriggerBtn && infoCloseBtn) {
		// 点击圆形按钮展开
		infoTriggerBtn.addEventListener('click', () => {
			infoWidget.classList.add('expanded');
		});

		// 点击关闭按钮收起
		infoCloseBtn.addEventListener('click', () => {
			infoWidget.classList.remove('expanded');
		});

		// (可选) 点击卡片外部区域也可以收起，如果需要的话可以启用下面这段
		/*
		document.addEventListener('click', (e) => {
			if (infoWidget.classList.contains('expanded') && 
				!infoWidget.contains(e.target)) {
				infoWidget.classList.remove('expanded');
			}
		});
		*/
	}

    // --- 应用程序初始化 ---
    initializeApp(); // 调用主初始化函数
});

