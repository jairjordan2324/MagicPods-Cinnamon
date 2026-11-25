# MagicPods Cinnamon

An unofficial, AI-assisted, lightweight Cinnamon applet powered by [MagicPodsCore](https://github.com/steam3d/MagicPodsCore).

## About

This was a personal project I started because I found Linux Mint's Bluetooth manager annoying and wanted a lightweight alternative for managing my headphones.

Much of this project was developed with assistance from ChatGPT and Codex as an experiment in native desktop integration and resource optimization.

I've tested it on my own system, but I can't guarantee that it will work on yours. I decided to make it public in case someone else finds it useful.

The original MagicPods application is far more mature, comprehensive, and feature-rich than this implementation. Several features are missing from this version, as this project was created primarily for optimization purposes.

Full credit goes to Aleksandr Maslov and Andrei Litvintsev for their work on MagicPodsCore. This project would not exist without their work.

For the complete experience, I recommend the [original MagicPods application](https://github.com/steam3d/MagicPodsLinux).

## Features

- Battery and charging indicators.
- Off, Transparency, and Noise Cancellation controls.
- In-ear detection.
- Automatic pause and resume controls.
- Low-battery notifications.
- Automatic backend recovery.
- Native Cinnamon integration without Qt.

## Performance

Preliminary benchmarks conducted on my personal system running Linux Mint 22.3.

| Measurement | Original MagicPods | Cinnamon Applet | Reduction |
|---|---:|---:|---:|
| Idle frontend memory (PSS) | 155.88 MiB | 4.20 MiB | 97.31% |
| Combined idle memory (PSS) | 168.39 MiB | 16.85 MiB | 90.00% |
| Installation footprint | 258.51 MiB | 2.25 MiB | 99.13% |

**Runtime download size: 873 KiB.**

These improvements were achieved by replacing the standalone Qt frontend with native Cinnamon components while retaining MagicPodsCore.

Applet memory is estimated from incremental Cinnamon PSS. Storage excludes system-provided dependencies. The applications do not provide equivalent feature sets, and results may vary across systems.

See [benchmark results and methodology](docs/verification.md) for further details.

## Installation

The release candidate targets Linux Mint 22.3 on x86-64.

Install the required dependencies:

    sudo apt install cinnamon cjs gir1.2-soup-3.0 bluez iproute2 procps \
    libbluetooth3 libpulse0 libssl3t64 libsystemd0 zlib1g \
    libavcodec60 libavutil58

Download and extract the runtime archive. Stop any existing MagicPods backend before running:

    ./install.sh

Open System Settings → Applets and add MagicPods to your panel.

## Uninstall

Remove MagicPods from the panel and run:

    ./uninstall.sh

## Known Limitations

- Several advanced features from the original application are missing.
- Charging case battery information may be unavailable.
- Battery and wear information may disappear after Bluetooth reconnection.
- Hardware compatibility has not been exhaustively tested.
- The localhost WebSocket API is unauthenticated.

## Source and Documentation

The corresponding `magicpods-cinnamon-source.tar.gz` archive includes backend source code, dependencies, patches, licensing information, and build instructions.

- [Architecture](docs/architecture.md)
- [Testing and benchmarks](docs/verification.md)
- [Current status and known issues](docs/current-status.md)

## License and Attribution

GPL-3.0. See `LICENSE` and `NOTICE`.

Original projects:

- [MagicPodsLinux](https://github.com/steam3d/MagicPodsLinux)
- [MagicPodsCore](https://github.com/steam3d/MagicPodsCore)

This is an independent, unofficial project and is not affiliated with or endorsed by the original MagicPods developers.