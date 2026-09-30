# TDP control research

VFang 1.0.0 supports automatic selection of Custom on AC and battery, using
the saved CPU and GPU power levels. It does not implement a watt-based power
limit slider. This document records the interfaces and validation needed for
that separate part of [issue #9](https://github.com/bladeandsoulx/vfang-razer-linux/issues/9).
No TDP limit, firmware setting or GPU persistence mode was changed during this
research.

## Existing controls

VFang sends the embedded controller its model-supported Low, Medium, High
and optional CPU Boost levels. Silent already selects Low for both CPU and
GPU. Custom therefore provides flexibility, not a promise of lower power than
Silent. The existing protocol does not encode an arbitrary watt value.

## Candidate interfaces

Intel CPU package power can be exposed through Linux powercap constraints.
Discover zones and constraint names rather than assuming a fixed index. Power
limits use microwatts, and time windows are separate attributes. Minimum and
maximum attributes are optional, so missing bounds must not become guessed
slider limits. These are package caps, not measurements of whole-laptop power
or the CPU's advertised design rating.
[Linux powercap documentation](https://cdn.kernel.org/doc/html/latest/power/powercap/powercap.html).

Some Intel client systems also expose platform minimum, maximum and increment
attributes through the processor thermal PCI driver. These are discovery
inputs, not independently validated operating limits for every Blade.
[Intel platform thermal documentation](https://cdn.kernel.org/doc/html/latest/driver-api/thermal/intel_dptf.html).

NVIDIA NVML exposes a separate GPU power-limit setter, with device-specific
minimum and maximum queries. Setting requires administrator access, can be
unsupported, and does not persist across reboot or driver unload. CPU powercap
support does not establish GPU support. Discovery must respect the existing
GPU runtime-suspension policy; it must not initialise NVML on a sleeping GPU
merely to decide whether to show a slider.
[NVIDIA NVML device commands](https://docs.nvidia.com/deploy/nvml-api/latest/api/group__nvmlDeviceCommands.html).

## Host observations

Read-only inspection on September 30 2026 found a Blade 18 RZ09-0509 with
BIOS 1.06. The Intel package long-term constraint read 120000000 microwatts,
while its constraint maximum attribute read 55000000. The platform thermal
attributes reported a minimum of 125000, maximum of 120000000 and increment
of 500000 microwatts.

Those different values are observations, not a safe slider range or proof
that a write would be accepted or maintained. A model-specific implementation
must explain the discrepancy and account for the embedded controller's own
policy before enabling writes. No other CPU family, Blade model or NVIDIA
mobile GPU was validated by this inspection.

## Requirements before implementation

1. Make CPU and GPU support independent, discovered capabilities. Keep the
   controls unavailable when permissions, valid bounds or platform support
   are missing. Do not infer support from the model name alone.
2. Define whether the CPU control changes sustained package power, burst
   power or both. Show the units and the exact meaning in the interface.
3. Validate model-specific conservative limits, read back accepted values,
   and report firmware rejection or later override without showing false
   success. Do not silently fight another power-management service.
4. Preserve the original limits and define ownership and restoration on
   errors, disable, shutdown, restart and suspend/resume. Keep existing thermal
   and fan protections intact; do not enable GPU persistence just for a slider.
5. Test unit conversion, optional or inconsistent bounds, rejected and partial
   writes, rollback and AC/battery transitions with fixtures first. Then
   validate on each supported hardware/backend combination and compare actual
   package power under a normal workload. A successful write is not proof of
   charging, battery-life improvement or whole-system power savings.

The proposed next increment is capability discovery and a narrowly scoped
CPU backend on a verified model. An AMD backend and NVIDIA watt slider remain
separate, unvalidated work. There is no universal watt range or release date
promised for this feature.
