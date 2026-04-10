export interface EditorCommand {
  type: "heading" | "text" | "newline" | "image" | "highlight" | "quote" | "separator" | "hashtags";
  text?: string;
  content?: string;
  color?: string;
  size?: number;
  bold?: boolean;
  count?: number;
  path?: string;
  tags?: string[];
}

export function toEditorScript(
  content: string,
  imagePaths: string[],
  hashtags: string[]
): EditorCommand[] {
  const commands: EditorCommand[] = [];
  const lines = content.split("\n");
  let imageIndex = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("# ") && !trimmed.startsWith("## ")) continue;

    if (trimmed.match(/^\[IMAGE_(TOP|MID|BOTTOM)\]$/)) {
      if (imageIndex < imagePaths.length) {
        commands.push({ type: "image", path: imagePaths[imageIndex] });
        commands.push({ type: "newline", count: 2 });
        imageIndex++;
      }
      continue;
    }

    if (trimmed.startsWith("## ")) {
      commands.push({ type: "newline", count: 2 });
      commands.push({
        type: "heading",
        text: trimmed.replace(/^##\s+/, ""),
        color: "#2DB400",
        size: 18,
      });
      commands.push({ type: "newline", count: 2 });
      continue;
    }

    if (trimmed.startsWith("> ")) {
      const quoteLines: string[] = [];
      let i = lines.indexOf(line);
      while (i < lines.length && lines[i].trim().startsWith("> ")) {
        quoteLines.push(lines[i].trim().replace(/^>\s*/, ""));
        i++;
      }
      commands.push({ type: "quote", text: quoteLines.join("\n") });
      commands.push({ type: "newline", count: 2 });
      continue;
    }

    if (trimmed === "") {
      commands.push({ type: "newline" });
      continue;
    }

    if (trimmed.includes("**")) {
      const parts = trimmed.split(/\*\*(.+?)\*\*/);
      for (let i = 0; i < parts.length; i++) {
        if (i % 2 === 0) {
          if (parts[i]) commands.push({ type: "text", content: parts[i] });
        } else {
          commands.push({ type: "highlight", text: parts[i], color: "#E8F5E9", bold: true });
        }
      }
      commands.push({ type: "newline" });
    } else {
      commands.push({ type: "text", content: trimmed });
      commands.push({ type: "newline" });
    }
  }

  if (hashtags.length > 0) {
    commands.push({ type: "newline", count: 2 });
    commands.push({ type: "hashtags", tags: hashtags });
  }

  return commands;
}

export function toHtml(
  content: string,
  imagePaths: string[],
  hashtags: string[]
): string {
  const lines = content.split("\n");
  let html = '<div style="font-family:\'Noto Sans KR\',sans-serif;line-height:2.2;color:#333">\n\n';
  let imageIndex = 0;
  let inBlockquote = false;
  const blockquoteLines: string[] = [];

  function flushBlockquote() {
    if (blockquoteLines.length > 0) {
      html += '<div style="border:1px solid #ddd;padding:20px;border-radius:10px;text-align:center;margin:25px 0;background:#fafafa">\n';
      html += blockquoteLines.map((l) => `<p>${l}</p>`).join("\n");
      html += "\n</div>\n\n<br>\n\n";
      blockquoteLines.length = 0;
    }
    inBlockquote = false;
  }

  for (const line of lines) {
    const trimmed = line.trim();

    if (inBlockquote && !trimmed.startsWith(">")) flushBlockquote();

    if (trimmed.startsWith("# ") && !trimmed.startsWith("## ")) continue;

    if (trimmed.match(/^\[IMAGE_(TOP|MID|BOTTOM)\]$/)) {
      if (imageIndex < imagePaths.length) {
        html += `<img src="${imagePaths[imageIndex]}" style="max-width:100%;border-radius:8px;margin:15px 0">\n\n`;
        imageIndex++;
      }
      continue;
    }

    if (trimmed.startsWith("## ")) {
      const headingText = trimmed.replace(/^##\s+/, "");
      html += `<br>\n\n<h3 style="color:#2DB400;font-size:18px">${headingText}</h3>\n\n`;
      continue;
    }

    if (trimmed.startsWith("> ")) {
      inBlockquote = true;
      blockquoteLines.push(trimmed.replace(/^>\s*/, ""));
      continue;
    }

    if (trimmed === "") {
      html += "<br>\n\n";
      continue;
    }

    let processed = trimmed.replace(
      /\*\*(.+?)\*\*/g,
      '<span style="background:#E8F5E9;padding:2px 6px;border-radius:3px"><b>$1</b></span>'
    );

    html += `<p>${processed}</p>\n\n`;
  }

  flushBlockquote();

  if (hashtags.length > 0) {
    html += "<br>\n\n";
    html += `<p style="color:#888;font-size:13px">${hashtags.map((t) => "#" + t).join(" ")}</p>\n\n`;
  }

  html += "</div>";
  return html;
}
