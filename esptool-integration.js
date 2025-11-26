/*
  作者：Eason-swc
  版本：v1.0
  日期：2025/11/19
*/

// 导入esptool.js库中的ESPLoader和Transport类，以及xterm.js相关的终端和适配器
import { ESPLoader, Transport } from './esptool-js/bundle.js';
import { Terminal } from 'https://cdn.jsdelivr.net/npm/xterm@5.3.0/+esm';
import { FitAddon } from 'https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.8.0/+esm';

// --- Xterm.js 终端初始化 ---

// 获取用于显示主控制台日志的DOM元素
const terminalElement = document.getElementById('terminal-log');
// 初始化主终端实例
const term = new Terminal({
    cols: 80, // 终端列数
    rows: 20, // 终端行数
    convertEol: true, // 自动转换行结束符
    theme: {
        background: '#000', // 背景色
        foreground: '#0F0' // 前景色 (文字颜色)
    }
});
// 初始化FitAddon插件，用于终端尺寸自适应
const fitAddon = new FitAddon();
term.loadAddon(fitAddon); // 加载FitAddon插件
term.open(terminalElement); // 将终端实例挂载到DOM元素
fitAddon.fit(); // 初始时调整终端大小以适应容器

// 初始化串口监视器终端实例
const serialMonitorTerminal = new Terminal({
    convertEol: true, // 自动转换行结束符
    theme: {
        background: '#1E1E1E', // 背景色
        foreground: '#FFFFFF' // 前景色
    }
});
// 初始化串口监视器终端的FitAddon插件
const monitorFitAddon = new FitAddon();
serialMonitorTerminal.loadAddon(monitorFitAddon); // 加载FitAddon插件

// 自定义终端接口，用于esptool.js库向xterm.js终端输出日志
const consoleTerminal = {
    clean: () => term.clear(), // 清空终端内容
    writeLine: (data) => term.writeln(data), // 写入一行数据并换行
    write: (data) => term.write(data), // 写入数据不换行
};

// --- ESPLoader相关状态变量 ---
let esploader = null; // ESPLoader实例
let transport = null; // 串口传输层实例
let device = null; // Web Serial API的SerialPort对象
let isMonitoring = false; // 串口监视状态
let monitorReader = null; // 串口监视器的ReadableStreamDefaultReader实例

/**
 * 串口监视循环：持续从串口读取数据并显示在监视器终端。
 * 此函数不返回，在后台持续运行直到读取器被取消。
 */
async function readLoopForMonitor() {
    // 检查传输层和设备是否可读
    if (!transport || !transport.device.readable) return;

    try {
        // 获取串口的可读流读取器
        monitorReader = transport.device.readable.getReader();
        while (true) {
            // 读取串口数据
            const { value, done } = await monitorReader.read();
            if (done) {
                // 读取器被取消，退出循环
                break;
            }
            // 将读取到的数据写入串口监视器终端
            serialMonitorTerminal.write(value);
        }
    } catch (error) {
        // 忽略读取器取消时可能发生的错误
    } finally {
        // 释放读取器锁
        if (monitorReader) {
            monitorReader.releaseLock();
            monitorReader = null;
        }
    }
}

/**
 * 启动串口监视功能。
 * 停止ESPLoader的SLIP模式，切换到原始数据模式，并开始读取串口数据。
 */
async function startSerialMonitor() {
    // 如果已经在监视或传输层未初始化，则不执行
    if (isMonitoring || !transport) return;
    isMonitoring = true; // 设置监视状态为true

    // 释放esploader传输层可能持有的锁，以便监视器可以访问串口
    if (transport.reader) {
        try {
            await transport.reader.cancel();
            transport.reader.releaseLock();
        } catch(e) { /* 忽略错误 */ }
        transport.reader = undefined;
    }
    
    transport.slipReaderEnabled = false; // 禁用SLIP模式，切换到原始数据读取
    readLoopForMonitor(); // 启动后台读取循环
}

/**
 * 停止串口监视功能。
 * 取消串口读取器，并重新启用ESPLoader的SLIP模式。
 */
async function stopSerialMonitor() {
    // 如果没有在监视，则不执行
    if (!isMonitoring) return;
    isMonitoring = false; // 设置监视状态为false

    // 如果读取器存在，取消读取操作
    if (monitorReader) {
        try {
            await monitorReader.cancel();
        } catch (error) {
            // 忽略取消读取时可能发生的错误
        }
    }
    
    // 重新启用ESPLoader的SLIP模式
    if (transport) {
        transport.slipReaderEnabled = true;
    }
}

/**
 * 初始化ESPLoader，连接到ESP设备并检测芯片。
 * @param {number} baudrate - 连接设备的波特率。
 * @returns {Promise<string>} 成功连接并检测到的芯片名称。
 * @throws {Error} 如果连接或初始化失败。
 */
async function initESPLoader(baudrate) {
    try {
        consoleTerminal.clean(); // 清空主终端显示
        consoleTerminal.writeLine("Attempting to connect..."); // 输出连接尝试信息
        if (device === null) {
            // 通过Web Serial API请求用户选择一个串口
            device = await navigator.serial.requestPort();
            // 初始化传输层，启用调试追踪
            transport = new Transport(device, true);
        }

        // 配置ESPLoader的选项
        const flashOptions = {
            transport,
            baudrate: baudrate, // 波特率
            terminal: consoleTerminal, // 自定义终端接口
            debugLogging: false, // 禁用esptool.js内部调试日志
            flashSize: "detect", // 自动检测闪存大小
        };
        // 实例化ESPLoader
        esploader = new ESPLoader(flashOptions);

        // 连接设备并检测芯片
        const chipName = await esploader.main();
        consoleTerminal.writeLine(`ESPLoader initialized. Detected chip: ${chipName}`); // 输出初始化成功及芯片名称
        return chipName;
    } catch (error) {
        console.error("Failed to initialize ESPLoader:", error); // 错误日志：初始化失败
        consoleTerminal.writeLine(`Connection failed: ${error.message}`); // 向控制台输出连接失败信息
        consoleTerminal.writeLine("Please ensure the device is in download mode (hold BOOT, press/release RESET, then release BOOT)."); // 引导用户进入下载模式
        // 在任何初始化失败时，确保设备和传输层被清除
        if (transport) {
            await transport.disconnect();
        }
        device = null;
        transport = null;
        esploader = null;
        throw error; // 抛出错误以供上层处理
    }
}

/**
 * 断开ESPLoader与ESP设备的连接。
 */
async function disconnectESPLoader() {
    try {
        if (transport) {
            await transport.disconnect(); // 断开传输层连接
        }
    } catch (error) {
        console.error("Error during disconnect:", error); // 错误日志：断开连接期间发生错误
    } finally {
        // 重置所有相关状态变量
        transport = null;
        device = null;
        esploader = null;
        consoleTerminal.writeLine("ESPLoader disconnected."); // 输出断开连接信息
    }
}

/**
 * 从指定路径获取二进制文件数据。
 * @param {string} filePath - 二进制文件的URL或路径。
 * @returns {Promise<string>} 二进制数据的字符串形式，esptool.js库期望的格式。
 * @throws {Error} 如果文件获取失败。
 */
async function fetchBinaryFile(filePath) {
    const response = await fetch(filePath); // 发起网络请求获取文件
    if (!response.ok) {
        throw new Error(`Failed to fetch ${filePath}: ${response.statusText}`); // 请求失败抛出错误
    }
    const buffer = await response.arrayBuffer(); // 将响应体解析为ArrayBuffer
    // 将ArrayBuffer转换为esptool.js期望的二进制字符串格式
    const binaryString = Array.from(new Uint8Array(buffer), byte => String.fromCharCode(byte)).join('');
    return binaryString;
}

/**
 * 开始烧录固件到ESP设备。
 * @param {object} selectedVersion - 包含固件版本信息的对象，特别是manifest_path。
 * @param {boolean} eraseFlash - 是否在烧录前擦除整个闪存。
 * @throws {Error} 如果ESPLoader未初始化或烧录过程中发生错误。
 */
async function startFlashing(selectedVersion, eraseFlash) {
    if (!esploader) {
        consoleTerminal.writeLine("ESPLoader is not initialized. Please connect a device first."); // ESPLoader未初始化提示
        throw new Error("ESPLoader is not initialized. Please connect a device first."); // 抛出错误
    }

    try {
        consoleTerminal.clean(); // 清空主终端
        consoleTerminal.writeLine("Starting flashing process..."); // 输出开始烧录信息

        if (eraseFlash) {
            consoleTerminal.writeLine("Erasing flash (this may take a while)..."); // 输出擦除闪存信息
            await esploader.eraseFlash(); // 执行擦除操作
            consoleTerminal.writeLine("Flash erase complete."); // 输出擦除完成信息
        }

        const manifestPath = selectedVersion.manifest_path; // 获取固件清单路径
        const basePath = manifestPath.substring(0, manifestPath.lastIndexOf('/') + 1); // 提取清单文件的基础路径
        const manifestResponse = await fetch(manifestPath); // 获取固件清单文件
        if (!manifestResponse.ok) {
            throw new Error(`Failed to fetch manifest: ${manifestResponse.statusText}`); // 获取清单失败抛出错误
        }
        const manifest = await manifestResponse.json(); // 解析固件清单JSON

        const fileArray = []; // 存储待烧录的文件数组
        for (const build of manifest.builds) {
            for (const part of build.parts) {
                const binaryPath = `${basePath}${part.path}`; // 拼接二进制文件完整路径
                consoleTerminal.writeLine(`Fetching ${part.path} at 0x${part.offset.toString(16)}...`); // 输出正在获取文件信息
                const binaryData = await fetchBinaryFile(binaryPath); // 获取二进制文件数据
                fileArray.push({ data: binaryData, address: part.offset }); // 添加到文件数组
            }
        }

        let lastProgressLine = ""; // 用于跟踪上一行进度信息，以便更新
        /**
         * 进度条回调函数，用于esptool.js的reportProgress。
         * 在终端中显示Arduino风格的进度条。
         * @param {number} fileIndex - 当前烧录文件的索引。
         * @param {number} written - 已写入的字节数。
         * @param {number} total - 文件总字节数。
         */
        const progressBar = (fileIndex, written, total) => {
            const fileName = fileArray[fileIndex].data.length > 0 ? `File ${fileIndex + 1}/${fileArray.length}` : `Empty file ${fileIndex + 1}/${fileArray.length}`; // 文件名称/索引
            const percentage = ((written / total) * 100).toFixed(0); // 计算百分比
            const progressBarLength = 20; // 进度条长度
            const filled = Math.round(progressBarLength * (written / total)); // 已填充的字符数
            const empty = progressBarLength - filled; // 未填充的字符数
            const bar = '[' + '█'.repeat(filled) + '-'.repeat(empty) + ']'; // 构建进度条视觉效果
            
            const newLine = `${fileName} ${bar} ${percentage}% `; // 构建新的进度行，\r使光标回到行首
            if (newLine !== lastProgressLine) {
                // 如果进度信息有变化，更新终端显示
                consoleTerminal.write(newLine + " ".repeat(Math.max(0, lastProgressLine.length - newLine.length))); // 覆盖上一行
                lastProgressLine = newLine; // 更新上一行进度信息
            }
        };

        // 烧录选项配置
        const flashOptions = {
            fileArray: fileArray, // 待烧录文件数组
            eraseAll: manifest.new_install_prompt_erase || false, // 是否擦除所有闪存
            compress: true, // 启用压缩以加快烧录速度
            flashMode: "keep", // 保持现有闪存模式
            flashFreq: "keep", // 保持现有闪存频率
            reportProgress: progressBar, // 使用自定义进度条回调
            calculateMD5Hash: (image) => window.CryptoJS.MD5(window.CryptoJS.enc.Latin1.parse(image)).toString(), // MD5哈希计算函数
        };

        await esploader.writeFlash(flashOptions); // 执行烧录操作
        await esploader.after(); // 执行烧录后的复位操作 (默认硬复位)

        consoleTerminal.writeLine("\n\rFlashing complete!"); // 输出烧录完成信息
    } catch (error) {
        console.error("Flashing failed:", error); // 错误日志：烧录失败
        consoleTerminal.writeLine(`\n\rFlashing failed: ${error.message}`); // 向控制台输出烧录失败信息
        throw error; // 抛出错误以供上层处理
    }
}

/**
 * 获取连接串口的详细信息。
 * @returns {Promise<object | null>} 包含USB Vendor ID, Product ID, 波特率, 芯片名称的对象，如果未连接则返回null。
 */
async function getSerialPortInfo() {
    // 如果没有设备、传输层或ESPLoader，则返回null
    if (!device || !transport || !esploader) {
        return null;
    }
    // 获取USB Vendor ID和Product ID，格式化为十六进制字符串
    const usbVendorId = device.usbVendorId ? `0x${device.usbVendorId.toString(16).padStart(4, '0')}` : 'N/A';
    const usbProductId = device.usbProductId ? `0x${device.usbProductId.toString(16).padStart(4, '0')}` : 'N/A';
    // 获取芯片名称
    const chipName = esploader.chip ? esploader.chip.CHIP_NAME : 'N/A';

    return {
        usbVendorId,
        usbProductId,
        baudRate: transport.baudrate, // 获取当前波特率
        chipName,
    };
}

/**
 * 获取当前连接的SerialPort对象。
 * @returns {SerialPort} 当前连接的SerialPort对象。
 */
function getConnectedPort() {
    return device;
}

/**
 * 改变串口的波特率。
 * @param {number} newBaudRate - 新的波特率值。
 */
async function changeBaudRate(newBaudRate) {
    if (transport) {
        await transport.disconnect(); // 先断开连接
        await transport.connect(newBaudRate); // 再以新波特率重新连接
    }
}

// 导出所有公共函数和对象，供其他模块使用
export {
    initESPLoader,
    disconnectESPLoader,
    startFlashing,
    getSerialPortInfo,
    getConnectedPort,
    consoleTerminal,
    fitAddon,
    changeBaudRate,
    serialMonitorTerminal,
    monitorFitAddon,
    startSerialMonitor,
    stopSerialMonitor
};
