const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegStatic = require("ffmpeg-static");
const ffmpegPath = ffmpegStatic.replace("app.asar", "app.asar.unpacked");
ffmpeg.setFfmpegPath(ffmpegPath);

function createWindow() {
  const win = new BrowserWindow({
    width: 500,
    height: 450,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false,
      allowRunningInsecureContent: true,
    },
  });

  win.loadFile("index.html");
}

app.whenReady().then(createWindow);

ipcMain.handle("open-file-dialog", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [
      {
        name: "Audio Files",
        extensions: ["mp3", "wav", "m4a", "aac", "ogg", "flac"],
      },
    ],
  });
  if (!result.canceled) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle("open-output", async (event, path) => {
  await shell.openPath(path);
});

ipcMain.on("generate-video", (event, data) => {
  const { path: audioPath, type, resolution, color } = data;
  console.log("Received generate-video:", data);
  const fileName = path
    .basename(audioPath, path.extname(audioPath))
    .replace(/[^a-zA-Z0-9]/g, "_");
  const outputPath = path.join(path.dirname(audioPath), `${fileName}.mp4`);

  console.log("入力:", audioPath);
  console.log("出力先:", outputPath);

  const resolutions = {
    720: "1280x720",
    1080: "1920x1080",
    square: "1080x1080",
  };
  const size = resolutions[resolution] || "1280x720";

  const filters = {
    line: `showwaves=s=${size}:mode=line:colors=${color}:r=30`,
    fill: `showwaves=s=${size}:mode=cline:draw=full:colors=${color}:r=30`,
    spectrum: `showspectrum=s=${size}:mode=combined:color=fire:slide=scroll:fps=30`,
    circle: `avectorscope=s=${size.split("x")[1]}x${size.split("x")[1]}:zoom=1.5:mode=lissajous,pad=${size.split("x")[0]}:${size.split("x")[1]}:(ow-iw)/2:(oh-ih)/2`,
  };

  const filterString = filters[type] || filters.line;

  ffmpeg()
    .input(audioPath)
    .complexFilter([
      `color=s=${size}:c=black:r=30[bg]`,
      "[0:a]asplit=2[a1][a2]",
      `[a1]${filterString}[wave]`,
      "[bg][wave]overlay=shortest=1[v_out]",
    ])
    .map("[v_out]")
    .map("[a2]")
    .videoCodec("libx264")
    .audioCodec("aac")
    .outputOptions(["-pix_fmt yuv420p", "-preset superfast"])
    .on("start", (command) => {
      console.log("FFmpegコマンド開始:", command);
      event.reply("status", "実行中...");
    })
    .on("error", (err, stdout, stderr) => {
      console.error("Message:", err.message);
      console.error("Stderr:", stderr);
      event.reply("status", "エラー: コンソールを確認してください");
    })
    .on("end", () => {
      event.reply("status", "成功!");
      event.reply("status", `成功: ${outputPath}`);
      console.log("完了しました:", outputPath);
      event.sender.send("open-output-ready", outputPath);
    })
    .save(outputPath);
});
