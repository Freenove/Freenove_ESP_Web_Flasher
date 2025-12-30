/*
  作者：Eason-swc
  版本：v2.0
  日期：2025/11/19
  描述：分离了串口连接和烧录逻辑，支持纯串口监视和无缝切换烧录模式。
*/

import { ESPLoader, Transport } from './esptool-js/bundle.js';
import { Terminal } from 'https://cdn.jsdelivr.net/npm/xterm@5.3.0/+esm';
import { FitAddon } from 'https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.8.0/+esm';

// --- Xterm.js 终端初始化 ---

// 1. 主控制台终端 (用于显示连接状态、烧录进度等系统日志)
const terminalElement = document.getElementById('terminal-log');
const term = new Terminal({
    cols: 80,
    rows: 20,
    convertEol: true,
    theme: { background: '#000', foreground: '#0F0' }
});
const fitAddon = new FitAddon();
term.loadAddon(fitAddon);
term.open(terminalElement);
fitAddon.fit();

// 2. 串口监视器终端 (用于显示设备串口输出)
const serialMonitorTerminal = new Terminal({
    convertEol: true,
    theme: { background: '#1E1E1E', foreground: '#FFFFFF' }
});
const monitorFitAddon = new FitAddon();
serialMonitorTerminal.loadAddon(monitorFitAddon);

// 适配器对象，供 esptool-js 使用
const consoleTerminal = {
    clean: () => term.clear(),
    writeLine: (data) => term.writeln(data),
    write: (data) => term.write(data),
};

// 新增：清空串口监视器
function clearSerialTerminal() {
    serialMonitorTerminal.clear();
}

// --- 全局状态变量 ---
let device = null;          // SerialPort 对象 (Web Serial API)
let transport = null;       // ESPLoader 的 Transport 对象 (仅在烧录时使用)
let esploader = null;       // ESPLoader 实例
let monitorReader = null;   // 串口监视器的读取器
let keepReading = false;    // 控制读取循环的标志
let currentBaudRate = 115200; // 当前波特率

// --- 核心功能：连接设备 (纯串口模式) ---

/**
 * 连接到设备并开始监视串口输出 (不复位芯片)。
 * @param {number} baudrate - 波特率
 */
async function connectToDevice(baudrate) {
    try {
        if (device === null) {
            device = await navigator.serial.requestPort();
        }

        // 如果端口已打开，先关闭 (防止重复打开)
        if (device.readable) {
           await device.close();
        }

        consoleTerminal.writeLine(`Connecting to serial port at ${baudrate}...`);
        await device.open({ baudRate: baudrate });
        
        currentBaudRate = baudrate;
        
        // consoleTerminal.writeLine("Connected to device (Serial Mode).");
        
        // 连接成功后立即启动串口监视
        // 增加短暂延迟，确保底层 readable 状态已更新，且让端口稳定
        setTimeout(() => startSerialMonitor(), 200);
        
        return true;
    } catch (error) {
        console.error("Connection failed:", error);
        consoleTerminal.writeLine(`Connection failed: ${error.message}`);
        throw error;
    }
}

/**
 * 断开设备连接。
 */
async function disconnectDevice() {
    try {
        await stopSerialMonitor(); // 停止读取循环
        
        if (device) {
            await device.close();
            device = null;
        }
        consoleTerminal.writeLine("Device disconnected.");
    } catch (error) {
        console.error("Disconnect failed:", error);
        consoleTerminal.writeLine(`Disconnect failed: ${error.message}`);
    }
}

// --- 核心功能：串口监视器 ---

/**
 * 启动串口监视读取循环。
 */
async function startSerialMonitor() {
    // 防止重复启动，先停止之前的
    if (keepReading) {
        keepReading = false;
        if (monitorReader) {
            try { await monitorReader.cancel(); } catch(e) {}
            monitorReader = null;
        }
    }

    if (!device) return;

    // 检查 readable 状态，如果未就绪则稍作等待
    if (!device.readable) {
        await new Promise(resolve => setTimeout(resolve, 100));
        if (!device.readable) {
            console.error("Serial Monitor Error: Port is not readable.");
            serialMonitorTerminal.writeln("\r\n[ERROR] Port not readable. Please reconnect.");
            return;
        }
    }
    
    keepReading = true;
    // serialMonitorTerminal.writeln(`\r\n[MONITOR] Started at ${currentBaudRate} baud.`);

    // 异步启动读取循环
    readLoop();
}

/**
 * 内部读取循环函数。
 */
async function readLoop() {
    while (device && device.readable && keepReading) {
        try {
            monitorReader = device.readable.getReader();
            while (true) {
                const { value, done } = await monitorReader.read();
                if (done) break;
                if (value) {
                    serialMonitorTerminal.write(value);
                }
            }
        } catch (error) {
            console.error("Read loop error:", error);
            break;
        } finally {
            if (monitorReader) {
                monitorReader.releaseLock();
                monitorReader = null;
            }
        }
    }
}

/**
 * 停止串口监视。
 */
async function stopSerialMonitor() {
    keepReading = false;
    if (monitorReader) {
        await monitorReader.cancel(); // 强制取消读取，使 getReader() 释放锁
        // releaseLock 会在 readLoop 的 finally 块中执行
    }
    // serialMonitorTerminal.writeln("\r\n[MONITOR] Stopped.");
}

/**
 * 发送数据到串口。
 * @param {string} data - 要发送的字符串。
 */
async function sendSerialData(data) {
    if (!device || !device.writable) {
        console.error("Device not writable.");
        return;
    }

    const encoder = new TextEncoder();
    const writer = device.writable.getWriter();
    try {
        await writer.write(encoder.encode(data));
        // 可选：回显发送的内容
        // serialMonitorTerminal.writeln(`[SENT] ${data.trim()}`); 
    } catch (error) {
        console.error("Send failed:", error);
    } finally {
        writer.releaseLock();
    }
}

/**
 * 更改波特率 (用于监视器)。
 */
async function changeBaudRate(newBaudRate) {
    if (!device) return;
    
    await stopSerialMonitor();
    await device.close();
    await device.open({ baudRate: newBaudRate });
    currentBaudRate = newBaudRate;
    startSerialMonitor();
}

// --- 核心功能：固件烧录 ---

/**
 * 从指定路径获取二进制文件数据。
 */
async function fetchBinaryFile(filePath) {
    const response = await fetch(filePath);
    if (!response.ok) {
        throw new Error(`Failed to fetch ${filePath}: ${response.statusText}`);
    }
    const buffer = await response.arrayBuffer();
    const binaryString = Array.from(new Uint8Array(buffer), byte => String.fromCharCode(byte)).join('');
    return binaryString;
}

/**
 * 执行烧录流程。
 * @param {object} selectedVersion - 固件版本信息
 * @param {boolean} eraseFlash - 是否擦除
 * @param {number} flashBaudRate - 烧录使用的波特率
 */
async function startFlashing(selectedVersion, eraseFlash, flashBaudRate) {
    if (!device) {
        throw new Error("Device not connected. Please click Connect first.");
    }

    // 记录当前的监视波特率，以便之后恢复
    const monitorBaudRate = currentBaudRate;

    consoleTerminal.writeLine("Preparing for flashing...");
    await stopSerialMonitor();
    await device.close();

    try {
        consoleTerminal.writeLine(`Initializing loader at ${flashBaudRate} baud...`);
        transport = new Transport(device, true); 
        
        const flashOptions = {
            transport,
            baudrate: flashBaudRate, // 使用传入的烧录波特率
            terminal: consoleTerminal,
            debugLogging: false,
            flashSize: "detect",
        };
        esploader = new ESPLoader(flashOptions);
        
        const chipName = await esploader.main();
        consoleTerminal.writeLine(`Detected chip: ${chipName}`);

        // 3. 执行擦除 (如果选中)
        if (eraseFlash) {
             await esploader.eraseFlash(); // 库函数会自动打印擦除日志
        }

        // 4. 下载并烧录固件
        consoleTerminal.writeLine("Downloading firmware files...");
        const manifestPath = selectedVersion.manifest_path;
        const basePath = manifestPath.substring(0, manifestPath.lastIndexOf('/') + 1);
        const manifestResponse = await fetch(manifestPath);
        if (!manifestResponse.ok) throw new Error("Failed to fetch manifest.");
        const manifest = await manifestResponse.json();

        const fileArray = [];
        for (const build of manifest.builds) {
            for (const part of build.parts) {
                const binaryPath = `${basePath}${part.path}`;
                consoleTerminal.writeLine(`Fetching ${part.path}...`);
                const binaryData = await fetchBinaryFile(binaryPath);
                fileArray.push({ data: binaryData, address: part.offset });
            }
        }

        consoleTerminal.writeLine("Writing to flash...");
        
        // 进度条回调
        let lastProgressLine = "";
        const progressBar = (fileIndex, written, total) => {
            const fileName = `File ${fileIndex + 1}/${fileArray.length}`;
            const percentage = ((written / total) * 100).toFixed(0);
            const progressBarLength = 20;
            const filled = Math.round(progressBarLength * (written / total));
            const empty = progressBarLength - filled;
            const bar = '[' + '█'.repeat(filled) + '-'.repeat(empty) + ']';
            const newLine = `${fileName} ${bar} ${percentage}% `;
            if (newLine !== lastProgressLine) {
                consoleTerminal.write(newLine + " ".repeat(Math.max(0, lastProgressLine.length - newLine.length)));
                lastProgressLine = newLine;
            }
        };

        await esploader.writeFlash({
            fileArray: fileArray,
            flashSize: "detect",
            eraseAll: false, // 之前已经处理过擦除了
            compress: true,
            flashMode: "dio", // 强制使用 DIO 模式，防止部分板子因 QIO 模式卡死
            flashFreq: "40m", // 强制使用 40MHz
            reportProgress: progressBar,
            calculateMD5Hash: (image) => window.CryptoJS.MD5(window.CryptoJS.enc.Latin1.parse(image)).toString(),
        });

        consoleTerminal.writeLine("\n\rFlashing complete!");

    } catch (error) {
        console.error("Flashing failed:", error);
        consoleTerminal.writeLine(`\n\rFlashing failed: ${error.message}`);
        throw error; // 向上抛出，以便 UI 处理
    } finally {
        // 6. 清理：断开 ESPLoader 连接
        if (transport) {
            await transport.disconnect();
            transport = null;
            esploader = null;
        }

        // 7. 恢复：重新连接串口并执行“双重复位”策略
        try {
            consoleTerminal.writeLine("Restoring serial connection...");
            await device.open({ baudRate: monitorBaudRate });

            // --- 第一次复位 ---
            consoleTerminal.writeLine("Performing 1st Hard Reset...");
            await device.setSignals({ dataTerminalReady: false, requestToSend: true });
            await new Promise(resolve => setTimeout(resolve, 100));
            await device.setSignals({ dataTerminalReady: false, requestToSend: false });
            
            // --- 等待 3 秒 ---
            await new Promise(resolve => setTimeout(resolve, 3000));

            // --- 第二次复位 ---
            await device.setSignals({ dataTerminalReady: false, requestToSend: true });
            await new Promise(resolve => setTimeout(resolve, 100));
            await device.setSignals({ dataTerminalReady: false, requestToSend: false });
            
            // 确保信号释放
            await device.setSignals({ dataTerminalReady: false, requestToSend: false });

            startSerialMonitor();
            consoleTerminal.writeLine("Device ready (Double Reset completed).");
        } catch (e) {
            console.error("Failed to restore serial connection:", e);
            consoleTerminal.writeLine("Note: Please manually reconnect if serial monitor is needed.");
        }
    }
}

/**
 * 获取串口信息
 */
async function getSerialPortInfo() {
    if (!device) return null;
    return {
        usbVendorId: device.usbVendorId,
        usbProductId: device.usbProductId,
        baudRate: currentBaudRate
    };
}

function getConnectedPort() {
    return device;
}

// 导出模块
export {
    connectToDevice,     // 替代 initESPLoader
    disconnectDevice,    // 替代 disconnectESPLoader
    startFlashing,
    getSerialPortInfo,
    getConnectedPort,
    consoleTerminal,
    fitAddon,
    changeBaudRate,
    serialMonitorTerminal,
    monitorFitAddon,
    startSerialMonitor,  // 现在内部自动管理，但也可以暴露
    stopSerialMonitor,   // 暴露以供模态框关闭时调用
    sendSerialData,       // 新增发送功能
    clearSerialTerminal   // 新增清空功能
};