import React from "react";
import {
  AbsoluteFill,
  Composition,
  Easing,
  interpolate,
  useCurrentFrame,
} from "remotion";

const FPS = 30;
export const DURATION = 540;

const theme = {
  bg: "#0e0e0e",
  cardBg: "#141414",
  cardBorder: "#2a2a2a",
  text: "#d4d4d4",
  muted: "#7d7d7d",
  prompt: "#4ec9b0",
  keyword: "#c586c0",
  command: "#9cdcfe",
  flag: "#b5cea8",
  string: "#ce9178",
  number: "#b5cea8",
  header: "#4fc1ff",
  jsonKey: "#9cdcfe",
  jsonString: "#ce9178",
  jsonNumber: "#b5cea8",
  work: "#4ec9b0",
  side: "#dcdcaa",
  personal: "#c586c0",
  fallback: "#7d7d7d",
};

const fontFamily =
  '"SFMono-Regular", "Menlo", "Monaco", "Consolas", "Liberation Mono", "Courier New", monospace';

const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));

function colorizeCommand(command: string): {
  text: string;
  colors: string[];
} {
  const chars: string[] = [];
  const colors: string[] = [];
  const regex = /"([^"\\]|\\.)*"|'([^'\\]|\\.)*'|\S+/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(command)) !== null) {
    for (let i = lastIndex; i < match.index; i++) {
      chars.push(command[i]);
      colors.push(theme.text);
    }
    const token = match[0];
    let color = theme.text;
    if (/^(npx|patty|curl|node|npm)$/.test(token)) color = theme.keyword;
    else if (/^--?/.test(token)) color = theme.flag;
    else if (/^(status|usage)$/.test(token)) color = theme.keyword;
    else if (
      token.startsWith('"') ||
      token.startsWith("'") ||
      /^https?:/.test(token)
    )
      color = theme.string;
    else if (token.includes("/")) color = theme.command;
    else if (/^-?\d/.test(token)) color = theme.number;
    for (const ch of token) {
      chars.push(ch);
      colors.push(color);
    }
    lastIndex = regex.lastIndex;
  }
  for (let i = lastIndex; i < command.length; i++) {
    chars.push(command[i]);
    colors.push(theme.text);
  }
  return { text: chars.join(""), colors };
}

export function colorJSON(json: string) {
  const parts = json
    .split(/("(?:[^"\\]|\\.)*")|(\{|\}|\[|\]|,|:)|(\s+)/)
    .filter(Boolean);
  return parts.map((p, i) => {
    if (/^"/.test(p))
      return (
        <span key={i} style={{ color: theme.jsonString }}>
          {p}
        </span>
      );
    if (/^-?\d/.test(p))
      return (
        <span key={i} style={{ color: theme.jsonNumber }}>
          {p}
        </span>
      );
    if (/[{}[\],:]/.test(p))
      return (
        <span key={i} style={{ color: theme.muted }}>
          {p}
        </span>
      );
    if (/true|false|null/.test(p))
      return (
        <span key={i} style={{ color: theme.keyword }}>
          {p}
        </span>
      );
    return <span key={i}>{p}</span>;
  });
}

function colorHeader(line: string) {
  const idx = line.indexOf(":");
  if (idx < 0) {
    return <span style={{ color: theme.header }}>{line}</span>;
  }
  return (
    <>
      <span style={{ color: theme.header }}>{line.slice(0, idx)}</span>
      <span>{line.slice(idx)}</span>
    </>
  );
}

const Typewriter: React.FC<{
  text: string;
  colors: string[];
  start: number;
  duration: number;
}> = ({ text, colors, start, duration }) => {
  const frame = useCurrentFrame();
  const progress = (frame - start) / duration;
  const visible = clamp(Math.floor(progress * text.length), 0, text.length);
  const showCursor = frame <= start + duration + 12;
  const blink = Math.floor(frame / 6) % 2 === 0;
  return (
    <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
      {Array.from({ length: visible }, (_, i) => (
        <span key={i} style={{ color: colors[i] }}>
          {text[i]}
        </span>
      ))}
      {showCursor && blink && (
        <span style={{ color: theme.prompt, marginLeft: 1 }}>▋</span>
      )}
    </span>
  );
};

const Prompt: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
      marginBottom: 2,
    }}
  >
    <span style={{ color: theme.prompt }}>$ </span>
    {children}
  </div>
);

function appearStyle(frame: number, start: number, duration = 15) {
  const o = interpolate(frame, [start, start + duration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const y = interpolate(frame, [start, start + duration], [8, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return {
    opacity: o,
    transform: `translateY(${y}px)`,
  };
}

const StatusPanel: React.FC<{ start: number }> = ({ start }) => {
  const frame = useCurrentFrame();
  const data = [
    { alias: "work", quota: 0.71, color: theme.work },
    { alias: "side", quota: 0.34, color: theme.side },
    { alias: "personal", quota: 0.08, color: theme.personal },
  ];
  const barMax = 360;
  return (
    <div style={{ ...appearStyle(frame, start), margin: "6px 0 10px" }}>
      {data.map((d, i) => {
        const s = start + 8 + i * 8;
        const width = interpolate(
          frame,
          [s, s + 35],
          [0, d.quota * barMax],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.ease) }
        );
        const pct = Math.round(d.quota * 100);
        return (
          <div
            key={d.alias}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 6,
              height: 20,
            }}
          >
            <span style={{ width: 70, color: theme.text, fontSize: 14 }}>{d.alias}</span>
            <div
              style={{
                width: barMax,
                height: 12,
                background: "#252525",
                borderRadius: 3,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width,
                  height: "100%",
                  background: d.color,
                  borderRadius: 3,
                }}
              />
            </div>
            <span style={{ width: 42, color: theme.muted, fontSize: 14 }}>{pct}%</span>
          </div>
        );
      })}
      <div style={{ marginLeft: 82, color: theme.work, marginTop: 2, fontSize: 14 }}>
        → next request: work
      </div>
    </div>
  );
};

const UsagePanel: React.FC<{ start: number }> = ({ start }) => {
  const frame = useCurrentFrame();
  const subTokens = 5;
  const apiTokens = 0;
  const barMax = 240;
  const subStart = start + 8;
  const subW = interpolate(
    frame,
    [subStart, subStart + 30],
    [0, barMax],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.ease) }
  );
  const apiW = 0;
  return (
    <div style={{ ...appearStyle(frame, start), margin: "6px 0 0" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 6,
          height: 20,
        }}
      >
        <span style={{ width: 110, color: theme.text, fontSize: 14 }}>subs</span>
        <div
          style={{
            width: barMax,
            height: 10,
            background: "#252525",
            borderRadius: 3,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: subW,
              height: "100%",
              background: theme.work,
              borderRadius: 3,
            }}
          />
        </div>
        <span style={{ width: 170, color: theme.muted, fontSize: 14 }}>
          {subTokens} tokens · $0.000032
        </span>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          height: 20,
        }}
      >
        <span style={{ width: 110, color: theme.text, fontSize: 14 }}>API fallback</span>
        <div
          style={{
            width: barMax,
            height: 10,
            background: "#252525",
            borderRadius: 3,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: apiW,
              height: "100%",
              background: theme.fallback,
              borderRadius: 3,
            }}
          />
        </div>
        <span style={{ width: 170, color: theme.muted, fontSize: 14 }}>
          {apiTokens} tokens · $0.000000
        </span>
      </div>
    </div>
  );
};

export const TerminalDemo: React.FC = () => {
  const frame = useCurrentFrame();

  const c1 =
    "npx @puffle/pattystack --fake=work:0.71 --fake=side:0.34 --fake=personal:0.08";
  const c2 = "patty status";
  const c3 =
    'curl -s -i http://127.0.0.1:3210/v1/chat/completions -H "authorization: Bearer $KEY" -H "content-type: application/json" -d \'{"model":"gpt-5-codex","messages":[{"role":"user","content":"hello"}]}\'';
  const c4 = "patty usage";

  const c1col = colorizeCommand(c1);
  const c2col = colorizeCommand(c2);
  const c3col = colorizeCommand(c3);
  const c4col = colorizeCommand(c4);

  const C1_START = 0;
  const C1_DUR = 95;
  const O1_START = C1_START + C1_DUR + 25;

  const C2_START = O1_START + 50;
  const C2_DUR = 18;
  const O2_START = C2_START + C2_DUR + 15;

  const C3_START = O2_START + 80;
  const C3_DUR = 130;
  const O3_START = C3_START + C3_DUR + 15;

  const C4_START = O3_START + 40;
  const C4_DUR = 18;
  const O4_START = C4_START + C4_DUR + 15;

  const daemonJson =
    '{"listening":{"address":"127.0.0.1","port":3210},"apiKey":"cp_live_...","warning":"API key shown once; store it securely"}';
  const bodyJson =
    '{"id":"run_c9bd530cf7a55647f964","object":"chat.completion","model":"gpt-5-codex","choices":[{"index":0,"message":{"role":"assistant","content":"fake: hello"},"finish_reason":"stop"}],"usage":{"prompt_tokens":2,"completion_tokens":3,"total_tokens":5}}';

  return (
    <AbsoluteFill
      style={{
        backgroundColor: theme.bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily,
        fontSize: 15,
        color: theme.text,
        lineHeight: "24px",
      }}
    >
      <div
        style={{
          width: 1180,
          height: 660,
          backgroundColor: theme.cardBg,
          border: `1px solid ${theme.cardBorder}`,
          borderRadius: 10,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            height: 30,
            backgroundColor: "#1a1a1a",
            borderBottom: `1px solid ${theme.cardBorder}`,
            display: "flex",
            alignItems: "center",
            padding: "0 12px",
            gap: 8,
            flexShrink: 0,
          }}
        >
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              backgroundColor: "#ff5f57",
            }}
          />
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              backgroundColor: "#febc2e",
            }}
          />
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              backgroundColor: "#28c840",
            }}
          />
          <span
            style={{
              marginLeft: 10,
              fontSize: 12,
              color: theme.muted,
              fontFamily: "sans-serif",
            }}
          >
            ~ pattystack
          </span>
        </div>

        <div style={{ padding: "18px 24px", flex: 1, overflow: "hidden" }}>
          <Prompt>
            <Typewriter
              text={c1col.text}
              colors={c1col.colors}
              start={C1_START}
              duration={C1_DUR}
            />
          </Prompt>

          <pre
            style={{
              ...appearStyle(frame, O1_START),
              margin: "4px 0 12px",
              fontFamily,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {colorJSON(daemonJson)}
          </pre>

          <Prompt>
            <Typewriter
              text={c2col.text}
              colors={c2col.colors}
              start={C2_START}
              duration={C2_DUR}
            />
          </Prompt>

          <StatusPanel start={O2_START} />

          <Prompt>
            <Typewriter
              text={c3col.text}
              colors={c3col.colors}
              start={C3_START}
              duration={C3_DUR}
            />
          </Prompt>

          <div style={{ ...appearStyle(frame, O3_START), margin: "4px 0 12px" }}>
            <div style={{ color: theme.header, marginBottom: 2 }}>
              {colorHeader("HTTP/1.1 200 OK")}
            </div>
            <div style={{ color: theme.header, marginBottom: 6 }}>
              {colorHeader("x-patty-sub: work")}
            </div>
            <pre
              style={{
                margin: 0,
                fontFamily,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {colorJSON(bodyJson)}
            </pre>
          </div>

          <Prompt>
            <Typewriter
              text={c4col.text}
              colors={c4col.colors}
              start={C4_START}
              duration={C4_DUR}
            />
          </Prompt>

          <UsagePanel start={O4_START} />
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const TerminalDemoComposition: React.FC = () => {
  return (
    <Composition
      id="TerminalDemo"
      component={TerminalDemo}
      durationInFrames={DURATION}
      fps={FPS}
      width={1280}
      height={720}
      defaultProps={{}}
    />
  );
};
