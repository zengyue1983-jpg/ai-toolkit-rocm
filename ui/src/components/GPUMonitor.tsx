import React, { useState, useEffect, useRef, useMemo } from 'react';
import { GPUApiResponse } from '@/types';
import Loading from '@/components/Loading';
import GPUWidget from '@/components/GPUWidget';
import { apiClient } from '@/utils/api';

const GpuMonitor: React.FC = () => {
  const [gpuData, setGpuData] = useState<GPUApiResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const isFetchingGpuRef = useRef(false);

  useEffect(() => {
    const fetchGpuInfo = async () => {
      if (isFetchingGpuRef.current) {
        return;
      }
      setLoading(true);
      isFetchingGpuRef.current = true;
      apiClient
        .get('/api/gpu')
        .then(res => res.data)
        .then(data => {
          setGpuData(data);
          setLastUpdated(new Date());
          setError(null);
        })
        .catch(err => {
          setError(`Failed to fetch GPU data: ${err instanceof Error ? err.message : String(err)}`);
        })
        .finally(() => {
          isFetchingGpuRef.current = false;
          setLoading(false);
        });
    };

    // Fetch immediately on component mount
    fetchGpuInfo();

    // Set up interval to fetch every 1 seconds
    const intervalId = setInterval(fetchGpuInfo, 1000);

    // Clean up interval on component unmount
    return () => clearInterval(intervalId);
  }, []);

  const getGridClasses = (gpuCount: number): string => {
    switch (gpuCount) {
      case 1:
        return 'grid-cols-1';
      case 2:
        return 'grid-cols-1 sm:grid-cols-2';
      case 3:
        return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';
      case 4:
        return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4';
      case 5:
      case 6:
        return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';
      case 7:
      case 8:
        return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4';
      case 9:
      case 10:
        return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-5';
      default:
        return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';
    }
  };

  console.log('state', {
    loading,
    gpuData,
    error,
    lastUpdated,
  });

  const content = useMemo(() => {
    if (loading && !gpuData) {
      return <Loading />;
    }

    if (error) {
      return (
        <div className="bg-red-900 border border-red-600 text-red-200 px-4 py-3 rounded relative" role="alert">
          <strong className="font-bold">Error!</strong>
          <span className="block sm:inline"> {error}</span>
        </div>
      );
    }

    if (!gpuData) {
      return (
        <div className="bg-yellow-900 border border-yellow-700 text-yellow-300 px-4 py-3 rounded relative" role="alert">
          <span className="block sm:inline">No GPU data available.</span>
        </div>
      );
    }

    // 修改：支持 AMD GPU (ROCm 7.2)
    if (!gpuData.hasNvidiaSmi && !gpuData.isMac && !gpuData.hasAmdGpu) {
      return (
        <div className="bg-yellow-900 border border-yellow-700 text-yellow-300 px-4 py-3 rounded relative" role="alert">
          <strong className="font-bold">No Supported GPU Detected!</strong>
          <span className="block sm:inline"> No NVIDIA GPU, AMD GPU (ROCm), or Apple Silicon GPU found on this system.</span>
          {gpuData.error && <p className="mt-2 text-sm">{gpuData.error}</p>}
          <div className="mt-3 text-xs opacity-75">
            <p>Supported GPU types:</p>
            <ul className="list-disc list-inside mt-1">
              <li>NVIDIA GPU (requires nvidia-smi)</li>
              <li>AMD GPU (requires ROCm with amd-smi or rocm-smi)</li>
              <li>Apple Silicon Mac (built-in GPU)</li>
            </ul>
          </div>
        </div>
      );
    }

    if (gpuData.gpus.length === 0) {
      return (
        <div className="bg-yellow-900 border border-yellow-700 text-yellow-300 px-4 py-3 rounded relative" role="alert">
          <strong className="font-bold">No GPUs Found!</strong>
          <span className="block sm:inline"> GPU monitoring tools are available but no GPUs were detected.</span>
          {gpuData.hasAmdGpu && (
            <p className="mt-2 text-sm">AMD ROCm tools found, but no AMD GPUs detected. Check ROCm installation and GPU drivers.</p>
          )}
        </div>
      );
    }

    const gridClass = getGridClasses(gpuData?.gpus?.length || 1);

    return (
      <>
        {/* 显示 GPU 类型标签 */}
        <div className="mb-3 flex gap-2">
          {gpuData.hasNvidiaSmi && (
            <span className="px-2 py-1 bg-green-900 text-green-300 text-xs rounded-full">
              NVIDIA GPU
            </span>
          )}
          {gpuData.hasAmdGpu && (
            <span className="px-2 py-1 bg-red-900 text-red-300 text-xs rounded-full">
              AMD GPU (ROCm)
            </span>
          )}
          {gpuData.isMac && (
            <span className="px-2 py-1 bg-blue-900 text-blue-300 text-xs rounded-full">
              Apple Silicon
            </span>
          )}
        </div>
        
        <div className={`grid ${gridClass} gap-3`}>
          {gpuData.gpus.map((gpu, idx) => (
            <GPUWidget key={idx} gpu={gpu} />
          ))}
        </div>
      </>
    );
  }, [loading, gpuData, error]);

  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-2">
        <h1 className="text-md">GPU Monitor</h1>
        <div className="text-xs text-gray-500">
          Last updated: {lastUpdated?.toLocaleTimeString()}
          {gpuData?.hasAmdGpu && (
            <span className="ml-2 text-red-400">• ROCm 7.2</span>
          )}
        </div>
      </div>
      {content}
    </div>
  );
};

export default GpuMonitor;
