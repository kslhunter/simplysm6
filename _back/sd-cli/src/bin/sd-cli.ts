#!/usr/bin/env node

import "source-map-support/register";

import * as os from "os";
import * as yargs from "yargs";
import { EventEmitter } from "events";
import { SdCliProject } from "../builders/SdCliProject";
import { Logger, LoggerSeverity } from "@simplysm/sd-core-node";
import { SdCliFileCrypto } from "../builders/SdCliFileCrypto";
import { SdCliCheck } from "../builders/SdCliCheck";
import { SdCliElectron } from "../builders/SdCliElectron";
import { SdCliCordova } from "../builders/SdCliCordova";
import { SdCliGenDbMigration } from "../build-tools/SdCliGenDbMigration";

EventEmitter.defaultMaxListeners = 0;
process.setMaxListeners(0);

const logger = Logger.get(["simplysm", "sd-cli"]);

(async (): Promise<void> => {
  const argv = await yargs.version(false)
    .help("help", "도움말")
    .alias("help", "h")
    .options({
      debug: {
        type: "boolean",
        describe: "디버그 로그를 표시할 것인지 여부",
        default: false
      }
    })
    .command(
      "watch",
      "변경감지 빌드를 수행합니다.",
      (cmd) => cmd
        .options({
          packages: {
            type: "array",
            describe: "수행할 패키지 설정",
            default: []
          },
          config: {
            type: "string",
            describe: "simplysm.json 파일 경로"
          },
          options: {
            type: "array",
            describe: "옵션 설정 (설정파일에서 @로 시작하는 부분)",
            default: []
          }
        })
    )
    .command(
      "build",
      "빌드를 수행합니다.",
      (cmd) => cmd
        .options({
          packages: {
            type: "array",
            describe: "수행할 패키지 설정",
            default: []
          },
          config: {
            type: "string",
            describe: "simplysm.json 파일 경로"
          },
          options: {
            type: "array",
            describe: "옵션 설정 (설정파일에서 @로 시작하는 부분)",
            default: []
          }
        })
    )
    .command(
      "publish",
      "프로젝트의 각 패키지를 배포합니다.",
      (cmd) => cmd.version(false)
        .options({
          build: {
            type: "boolean",
            describe: "새로 빌드한 후에 배포합니다",
            default: false
          },
          packages: {
            type: "array",
            describe: "수행할 패키지 설정",
            default: []
          },
          config: {
            type: "string",
            describe: "simplysm.json 파일 경로"
          },
          options: {
            type: "array",
            describe: "옵션 설정 (설정파일에서 @로 시작하는 부분)",
            default: []
          }
        })
    )
    .command(
      "gen-db-migration",
      "DB를 비교하여 Migration 파일을 생성합니다.",
      (cmd) => cmd.version(false)
        .options({
          config: {
            type: "string",
            describe: "simplysm.json 파일 경로"
          },
          key: {
            type: "string",
            describe: "키",
            demandOption: true
          }
        })
    )
    .command(
      "run-desktop-browser <url>",
      "데스크탑 브라우저를 시작합니다.",
      (cmd) => cmd.version(false)
        .positional("url", {
          type: "string",
          describe: "오픈할 HTML 파일 혹은 링크",
          demandOption: true
        })
        .options({
          width: {
            type: "number",
            describe: "너비"
          },
          height: {
            type: "number",
            describe: "높이"
          }
        })
    )
    .command(
      "run-cordova-device <cordovaProjectPath> <url>",
      "CORDOVA WATCH를 디바이스에 띄웁니다.",
      (cmd) => cmd.version(false)
        .positional("cordovaProjectPath", {
          type: "string",
          describe: "CORDOVA 프로젝트 경로",
          demandOption: true
        })
        .positional("url", {
          type: "string",
          describe: "오픈할 HTML 파일 혹은 링크",
          demandOption: true
        })
    )
    .command(
      "local-update",
      "로컬 라이브러리 업데이트를 수행합니다.",
      (cmd) => cmd.version(false)
        .options({
          config: {
            type: "string",
            describe: "simplysm.json 파일 경로"
          },
          options: {
            type: "array",
            describe: "옵션 설정 (설정파일에서 @로 시작하는 부분)",
            default: []
          }
        })
    )
    .command(
      "enc-file <file>",
      "파일을 암호화 합니다.",
      (cmd) => cmd.version(false)
        .positional("file", {
          type: "string",
          describe: "암호화할 파일명"
        })
    )
    .command(
      "dec-file <file>",
      "파일을 복호화 합니다.",
      (cmd) => cmd.version(false)
        .positional("file", {
          type: "string",
          describe: "암호화된 파일명"
        })
    )
    .command(
      "check",
      "패키지 유효성을 체크합니다.",
      (cmd) => cmd.version(false)
        .options({
          all: {
            type: "boolean",
            describe: "모든 패키지 체크",
            default: false
          }
        })
    )
    .parse();

  if (argv.debug) {
    Error.stackTraceLimit = 100; //Infinity;

    process.env.SD_CLI_LOGGER_SEVERITY = "DEBUG";

    Logger.setConfig({
      console: {
        level: LoggerSeverity.debug
      }
    });
  }
  else {
    Logger.setConfig({
      dot: true
    });
  }

  const args = argv._;

  if (args[0] === "watch") {
    await new SdCliProject().buildAsync({
      watch: true,
      packages: argv.packages,
      config: argv.config,
      options: argv.options
    });
  }
  else if (args[0] === "build") {
    await new SdCliProject().buildAsync({
      watch: false,
      packages: argv.packages,
      config: argv.config,
      options: argv.options
    });
    process.exit(0);
  }
  else if (args[0] === "local-update") {
    await new SdCliProject().localUpdateAsync({
      config: argv.config,
      options: argv.options
    });
  }
  else if (argv._[0] === "publish") {
    await new SdCliProject().publishAsync({
      build: argv.build,
      packages: argv.packages,
      config: argv.config,
      options: argv.options
    });
    process.exit(0);
  }
  else if (argv._[0] === "gen-db-migration") {
    await new SdCliGenDbMigration().runAsync(argv.config, argv.key);
  }
  else if (args[0] === "run-desktop-browser") {
    await new SdCliElectron().runAsync(argv.url!, { type: "windows", width: argv.width, height: argv.height });
  }
  else if (args[0] === "run-cordova-device") {
    await new SdCliCordova().runDeviceAsync(argv.cordovaProjectPath, argv.url!);
  }
  else if (args[0] === "enc-file") {
    await new SdCliFileCrypto().encryptAsync(argv.file!);
  }
  else if (args[0] === "dec-file") {
    await new SdCliFileCrypto().decryptAsync(argv.file!);
  }
  else if (args[0] === "check") {
    await new SdCliCheck().checkAsync(argv.all);
  }
  else {
    throw new Error(`명령어가 잘못되었습니다.${os.EOL + os.EOL}\t${argv._[0]}${os.EOL}`);
  }
})().catch((err) => {
  logger.error(err);
  process.exit(1);
});
