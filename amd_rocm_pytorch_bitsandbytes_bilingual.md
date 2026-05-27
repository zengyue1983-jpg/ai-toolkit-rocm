# AMD ROCm + PyTorch + bitsandbytes 安装整理

# AMD ROCm + PyTorch + bitsandbytes Installation Notes

整理日期 / Date: 2026-05-27

## 适用环境 / Target Environment

中文：

- GPU：Radeon RX 9000 系列，示例页面为 AMD Radeon RX 9070 XT。
- 系统：Ubuntu 24.04.4 HWE。
- Radeon Software for Linux：25.35.1。
- ROCm：7.2.1。
- PyTorch：2.9.1，ROCm 7.2.1 wheel。
- Python wheel 标签：`cp312`，对应 Python 3.12。

English:

- GPU: Radeon RX 9000 series; the referenced AMD page is for AMD Radeon RX 9070 XT.
- OS: Ubuntu 24.04.4 HWE.
- Radeon Software for Linux: 25.35.1.
- ROCm: 7.2.1.
- PyTorch: 2.9.1 with ROCm 7.2.1 wheels.
- Python wheel tag: `cp312`, which corresponds to Python 3.12.

## 1. 安装 AMD Radeon Software / ROCm

## 1. Install AMD Radeon Software / ROCm

中文：

这一步安装 AMD 官方的 `amdgpu-install` 工具，并通过 `--usecase=graphics,rocm` 同时安装图形驱动和 ROCm 组件。最后一条命令把当前用户加入 `render` 和 `video` 用户组，以便访问 GPU 设备。

English:

This step installs AMD's official `amdgpu-install` package, then installs both graphics and ROCm components with `--usecase=graphics,rocm`. The last command adds the current user to the `render` and `video` groups so the user can access GPU devices.

```bash
sudo apt update
wget https://repo.radeon.com/amdgpu-install/7.2.1/ubuntu/noble/amdgpu-install_7.2.1.70201-1_all.deb
sudo apt install ./amdgpu-install_7.2.1.70201-1_all.deb
sudo amdgpu-install -y --usecase=graphics,rocm
sudo usermod -a -G render,video $LOGNAME
```

中文：

执行 `usermod` 后，通常需要重新登录或重启系统，用户组权限才会在当前会话中生效。

English:

After running `usermod`, you usually need to log out and back in, or reboot, before the new group permissions apply to the current user session.

## 2. 安装 PyTorch ROCm Wheels

## 2. Install PyTorch ROCm Wheels

中文：

这一步从 AMD ROCm wheel 仓库下载 PyTorch、torchvision、Triton 和 torchaudio 的 ROCm 7.2.1 版本。这里的 wheel 是 Ubuntu 24.04 / Python 3.12 对应的 `cp312` 包。

English:

This step downloads ROCm 7.2.1 wheels for PyTorch, torchvision, Triton, and torchaudio from AMD's ROCm wheel repository. These wheels use the `cp312` tag for Ubuntu 24.04 / Python 3.12.

```bash
wget https://repo.radeon.com/rocm/manylinux/rocm-rel-7.2.1/torch-2.9.1%2Brocm7.2.1.lw.gitff65f5bc-cp312-cp312-linux_x86_64.whl
wget https://repo.radeon.com/rocm/manylinux/rocm-rel-7.2.1/torchvision-0.24.0%2Brocm7.2.1.gitb919bd0c-cp312-cp312-linux_x86_64.whl
wget https://repo.radeon.com/rocm/manylinux/rocm-rel-7.2.1/triton-3.5.1%2Brocm7.2.1.gita272dfa8-cp312-cp312-linux_x86_64.whl
wget https://repo.radeon.com/rocm/manylinux/rocm-rel-7.2.1/torchaudio-2.9.0%2Brocm7.2.1.gite3c6ee2b-cp312-cp312-linux_x86_64.whl
pip3 uninstall torch torchvision triton torchaudio
pip3 install torch-2.9.1+rocm7.2.1.lw.gitff65f5bc-cp312-cp312-linux_x86_64.whl torchvision-0.24.0+rocm7.2.1.gitb919bd0c-cp312-cp312-linux_x86_64.whl torchaudio-2.9.0+rocm7.2.1.gite3c6ee2b-cp312-cp312-linux_x86_64.whl triton-3.5.1+rocm7.2.1.gita272dfa8-cp312-cp312-linux_x86_64.whl
```

中文：

- `pip3 uninstall` 用于移除已有的 PyTorch 相关包，避免与 ROCm wheel 混用。
- `pip3 install` 按本地 wheel 文件安装 ROCm 版 PyTorch 组件。
- 如果系统 Python 不是 3.12，或系统不是 Ubuntu 24.04，对应 wheel 可能需要换成其他 Python 标签或发行版版本。

English:

- `pip3 uninstall` removes existing PyTorch-related packages to avoid mixing them with the ROCm wheels.
- `pip3 install` installs the ROCm-enabled PyTorch components from the local wheel files.
- If your system Python is not 3.12, or your OS is not Ubuntu 24.04, the wheel tags or distribution-specific packages may need to be changed.

## 3. 安装 bitsandbytes

## 3. Install bitsandbytes

中文：

bitsandbytes 的 release 页面提醒：对于自定义 PyTorch 构建，例如 Intel XPU、ROCm 等，使用 `--force-reinstall` 时，pip 可能会重新从 PyPI 解析依赖，并把当前 ROCm 版 PyTorch 替换成默认 CUDA 版本。为了避免这种情况，需要加上 `--no-deps`。

English:

The bitsandbytes release notes warn that for custom PyTorch builds, such as Intel XPU or ROCm builds, using `--force-reinstall` can make pip re-resolve dependencies from PyPI. That may replace the ROCm PyTorch build with the default CUDA variant. To avoid this, add `--no-deps`.

```bash
pip install --force-reinstall --no-deps https://github.com/bitsandbytes-foundation/bitsandbytes/releases/download/continuous-release_main/bitsandbytes-1.33.7.preview-py3-none-manylinux_2_24_x86_64.whl
```

中文：

这里的重点是 `--no-deps`：它告诉 pip 只安装这个 bitsandbytes wheel，不重新安装或替换 PyTorch 依赖。

English:

The key flag is `--no-deps`: it tells pip to install only this bitsandbytes wheel, without reinstalling or replacing PyTorch dependencies.

## 4. 验证建议

## 4. Verification Suggestions

中文：

完成安装后，建议确认三件事：

1. 当前用户已经进入 `render` 和 `video` 组。
2. ROCm 设备可以被系统识别。
3. Python 中的 PyTorch 可以正常导入，并且 GPU 可用。

English:

After installation, it is recommended to confirm three things:

1. The current user is in the `render` and `video` groups.
2. ROCm devices are visible to the system.
3. PyTorch can be imported in Python and the GPU is available.

中文：

如果 PyTorch 可导入，但 GPU 不可用，优先检查用户组是否生效、是否已经重新登录或重启，以及 PyTorch wheel 是否与 ROCm 版本和 Python 版本匹配。

English:

If PyTorch imports successfully but the GPU is not available, first check whether the user group changes have taken effect, whether you have logged in again or rebooted, and whether the PyTorch wheel matches the installed ROCm and Python versions.

## 5. 来源链接

## 5. Source Links

- AMD Radeon RX 9070 XT previous drivers page: <https://www.amd.com/zh-cn/support/downloads/previous-drivers.html/graphics/radeon-rx/radeon-rx-9000-series/amd-radeon-rx-9070-xt.html>
- AMD ROCm PyTorch installation guide: <https://rocm.docs.amd.com/projects/radeon-ryzen/en/latest/docs/install/installrad/native_linux/install-pytorch.html>
- bitsandbytes releases: <https://github.com/bitsandbytes-foundation/bitsandbytes/releases>

