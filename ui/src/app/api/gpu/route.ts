import { NextResponse } from 'next/server';
import { exec, execSync } from 'child_process';
import { promisify } from 'util';
import { createRequire } from 'module';
import os from 'os';

const execAsync = promisify(exec);

interface MacGpuResult {
  name: string;
  memUsed: number;
  memTotal: number;
  gpuLoad: number;
  temperature: number;
  fanSpeed: number;
  powerDraw: number;
}

async function getMacGpuInfo(): Promise<MacGpuResult | null> {
  try {
    const memoryTotal = os.totalmem() / (1024 * 1024);

    // Get GPU name and core count from system_profiler
    let gpuName = 'Apple GPU';
    try {
      const spOut = execSync(
        'system_profiler SPDisplaysDataType 2>/dev/null | grep -E "Chipset Model|Total Number of Cores"',
        { encoding: 'utf-8', timeout: 5000 },
      );
      const nameMatch = spOut.match(/Chipset Model:\s*(.+)/);
      const coresMatch = spOut.match(/Total Number of Cores:\s*(\d+)/);
      if (nameMatch) {
        gpuName = nameMatch[1].trim();
        if (coresMatch) {
          gpuName += ` GPU (${coresMatch[1]} cores)`;
        }
      }
    } catch {
      // fallback to generic name
    }

    let temperature = 0;
    let gpuLoad = 0;
    let fanSpeed = 0;
    let powerDraw = 0;
    let memUsed = 0;
    let memTotal = memoryTotal;

    try {
      // Use createRequire to hide from webpack static analysis so it doesn't fail on non-mac platforms
      const nativeRequire = createRequire(import.meta.url);
      const ms = nativeRequire('macstats') as any;

      try {
        const gpuData = ms.getGpuDataSync();
        temperature = gpuData.temperature || 0;
        gpuLoad = gpuData.usage || 0;
      } catch {
        // ignore
      }

      try {
        const fanData = ms.getFanDataSync();
        const fanKeys = Object.keys(fanData);
        if (fanKeys.length > 0) {
          fanSpeed = fanData[fanKeys[0]].rpm || 0;
        }
      } catch {
        // ignore
      }

      try {
        const powerData = ms.getPowerDataSync();
        powerDraw = powerData.gpu || 0;
      } catch {
        // ignore
      }

      try {
        const ramData = ms.getRAMUsageSync();
        memUsed = ramData.used / (1024 * 1024);
        memTotal = ramData.total / (1024 * 1024);
      } catch {
        // ignore
      }
    } catch (error) {
      console.warn('macstats not available:', error);
    }

    return { name: gpuName, memUsed, memTotal, gpuLoad, temperature, fanSpeed, powerDraw };
  } catch {
    return null;
  }
}

// 新增：检查 AMD SMI 工具是否可用，返回可用的命令名
async function getAmdSmiCommand(): Promise<string | null> {
  try {
    await execAsync('which amd-smi');
    return 'amd-smi';
  } catch {
    try {
      await execAsync('which rocm-smi');
      return 'rocm-smi';
    } catch {
      return null;
    }
  }
}

// 新增：获取 AMD GPU 信息
async function getAmdGpuStats(command: string) {
  try {
    let stdout: string;
    
    if (command === 'amd-smi') {
      // amd-smi 支持 JSON 输出
      const result = await execAsync(
        'amd-smi static --json && echo "___SEPARATOR___" && amd-smi metric --json',
        { timeout: 10000 }
      );
      stdout = result.stdout;
    } else {
      // rocm-smi 支持 JSON 输出
      const result = await execAsync(
        'rocm-smi --showproductname --json',
        { timeout: 10000 }
      );
      stdout = result.stdout;
    }

    if (command === 'amd-smi') {
      const parts = stdout.split('___SEPARATOR___');
      if (parts.length !== 2) {
        return [];
      }

      const staticData = JSON.parse(parts[0].trim());
      const metricData = JSON.parse(parts[1].trim());

      return staticData.gpu_data.map((gpu: any) => {
        const metrics =
          metricData.gpu_data.find(
            (m: any) => String(m.gpu) === String(gpu.gpu)
          ) || {};

        const memTotal =
          parseFloat(metrics.mem_usage?.total_vram?.value) || 0;

        const memUsed =
          parseFloat(metrics.mem_usage?.used_vram?.value) || 0;

        const memFree =
          parseFloat(metrics.mem_usage?.free_visible_vram?.value) || 0;

        return {
          index: Number(gpu.gpu),

          name:
            gpu.asic?.market_name ||
            gpu.asic?.device_name ||
            'AMD GPU',

          driverVersion:
            gpu.driver?.version ||
            'ROCm',

          temperature: Math.round(
            parseFloat(
              metrics.temperature?.hotspot?.value ??
              metrics.temperature?.edge?.value ??
              0
            )
          ),

          utilization: {
            gpu: parseFloat(
              metrics.usage?.gfx_activity?.value
            ) || 0,

            memory:
              memTotal > 0
                ? Math.round((memUsed / memTotal) * 100)
                : 0,
          },

          memory: {
            total: Math.round(memTotal),
            free: Math.round(memFree),
            used: Math.round(memUsed),
          },

          power: {
            draw:
              parseFloat(
                metrics.power?.socket_power?.value
              ) || 0,

            limit:
              parseFloat(
                gpu.limit?.max_power?.value ??
                gpu.limit?.ppt0?.max_power_limit?.value ??
                0
              ) || 0,
          },

          clocks: {
            graphics:
              parseInt(
                metrics.clock?.gfx_0?.clk?.value
              ) || 0,

            memory:
              parseInt(
                metrics.clock?.mem_0?.clk?.value
              ) || 0,
          },

          fan: {
            speed:
              parseFloat(
                metrics.fan?.usage?.value
              ) || 0,
          },
        };
      });
    } else {
      // rocm-smi 格式解析
      const data = JSON.parse(stdout);
      return Object.entries(data).map(([key, value]: [string, any], index) => ({
        index,
        name: value['Card series'] || 'AMD GPU',
        driverVersion: value['Driver version'] || 'ROCm',
        temperature: Math.round(parseFloat(value['Temperature (Sensor edge)'] || 0)),
        utilization: {
          gpu: parseFloat(value['GPU use (%)'] || 0),
          memory: parseFloat(value['GPU memory use (%)'] || 0),
        },
        memory: {
          total: 0, // rocm-smi 不提供总内存，需要从其他方式获取
          free: 0,
          used: 0,
        },
        power: {
          draw: parseFloat(value['Average Graphics Package Power (W)'] || 0),
          limit: 0,
        },
        clocks: {
          graphics: parseInt(value['mclk'] || 0),
          memory: parseInt(value['sclk'] || 0),
        },
        fan: {
          speed: parseFloat(value['Fan speed (%)'] || 0),
        },
      }));
    }
  } catch (error) {
    console.error('Failed to get AMD GPU stats:', error);
    return [];
  }
}

export async function GET() {
  try {
    // Get platform
    const platform = os.platform();
    const isWindows = platform === 'win32';
    const isMac = platform === 'darwin';

    if (isMac) {
      const macGpu = await getMacGpuInfo();
      if (macGpu) {
        return NextResponse.json({
          hasNvidiaSmi: false,
          isMac: true,
          gpus: [
            {
              index: 0,
              name: macGpu.name,
              driverVersion: 'macOS',
              temperature: Math.round(macGpu.temperature),
              utilization: {
                gpu: macGpu.gpuLoad,
                memory: macGpu.memTotal > 0 ? Math.round((macGpu.memUsed / macGpu.memTotal) * 100) : 0,
              },
              memory: {
                total: Math.round(macGpu.memTotal),
                free: Math.round(macGpu.memTotal - macGpu.memUsed),
                used: Math.round(macGpu.memUsed),
              },
              power: { draw: macGpu.powerDraw, limit: 0 },
              clocks: { graphics: 0, memory: 0 },
              fan: { speed: macGpu.fanSpeed },
            },
          ],
        });
      }
      return NextResponse.json({
        hasNvidiaSmi: false,
        isMac: true,
        gpus: [],
        error: 'Could not read Mac GPU stats',
      });
    }

    // Check if nvidia-smi is available
    const hasNvidiaSmi = await checkNvidiaSmi(isWindows);
    
    // 新增：检查 AMD GPU
    const amdCommand = !isWindows && !hasNvidiaSmi ? await getAmdSmiCommand() : null;

    if (amdCommand) {
      const gpuStats = await getAmdGpuStats(amdCommand);
      return NextResponse.json({
        hasNvidiaSmi: false,
        isMac: false,
        hasAmdGpu: true,
        gpus: gpuStats,
      });
    }

    if (!hasNvidiaSmi) {
      return NextResponse.json({
        hasNvidiaSmi: false,
        isMac: false,
        gpus: [],
        error: 'nvidia-smi not found or not accessible',
      });
    }

    // Get GPU stats
    const gpuStats = await getGpuStats(isWindows);

    return NextResponse.json({
      hasNvidiaSmi: true,
      gpus: gpuStats,
    });
  } catch (error) {
    console.error('Error fetching GPU stats:', error);
    return NextResponse.json(
      {
        hasNvidiaSmi: false,
        isMac: false,
        gpus: [],
        error: `Failed to fetch GPU stats: ${error instanceof Error ? error.message : String(error)}`,
      },
      { status: 500 },
    );
  }
}

async function checkNvidiaSmi(isWindows: boolean): Promise<boolean> {
  try {
    if (isWindows) {
      // Check if nvidia-smi is available on Windows
      // It's typically located in C:\Program Files\NVIDIA Corporation\NVSMI\nvidia-smi.exe
      // but we'll just try to run it directly as it may be in PATH
      await execAsync('nvidia-smi -L');
    } else {
      // Linux/macOS check
      await execAsync('which nvidia-smi');
    }
    return true;
  } catch (error) {
    return false;
  }
}

async function getGpuStats(isWindows: boolean) {
  // Command is the same for both platforms, but the path might be different
  const command =
    'nvidia-smi --query-gpu=index,name,driver_version,temperature.gpu,utilization.gpu,utilization.memory,memory.total,memory.free,memory.used,power.draw,power.limit,clocks.current.graphics,clocks.current.memory,fan.speed --format=csv,noheader,nounits';

  // Execute command
  const { stdout } = await execAsync(command, {
    env: { ...process.env, CUDA_DEVICE_ORDER: 'PCI_BUS_ID' },
  });

  // Parse CSV output
  const gpus = stdout
    .trim()
    .split('\n')
    .map(line => {
      const [
        index,
        name,
        driverVersion,
        temperature,
        gpuUtil,
        memoryUtil,
        memoryTotal,
        memoryFree,
        memoryUsed,
        powerDraw,
        powerLimit,
        clockGraphics,
        clockMemory,
        fanSpeed,
      ] = line.split(', ').map(item => item.trim());

      return {
        index: parseInt(index),
        name,
        driverVersion,
        temperature: parseInt(temperature),
        utilization: {
          gpu: parseInt(gpuUtil),
          memory: parseInt(memoryUtil),
        },
        memory: {
          total: parseInt(memoryTotal),
          free: parseInt(memoryFree),
          used: parseInt(memoryUsed),
        },
        power: {
          draw: parseFloat(powerDraw),
          limit: parseFloat(powerLimit),
        },
        clocks: {
          graphics: parseInt(clockGraphics),
          memory: parseInt(clockMemory),
        },
        fan: {
          speed: parseInt(fanSpeed) || 0, // Some GPUs might not report fan speed, default to 0
        },
      };
    });

  return gpus;
}
