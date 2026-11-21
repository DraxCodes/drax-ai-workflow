#!/usr/bin/env node
import { runBenchmarkCommand } from "./lib/benchmark-cli.mjs";

process.exitCode = await runBenchmarkCommand(process.argv.slice(2));