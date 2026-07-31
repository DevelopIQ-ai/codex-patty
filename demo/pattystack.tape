# VHS demo for Pattystack
# Render: vhs demo/pattystack.tape
# Requires pattystack and patty on your PATH (e.g. npm i -g @puffle/pattystack).

Output demo/pattystack.gif
Output demo/pattystack.webm

Set Shell "bash"
Set FontSize 28
Set Width 1200
Set Height 700
Set Theme "Catppuccin Mocha"
Set WindowBar Colorful
Set TypingSpeed 40ms

# Set up an isolated demo environment and start the daemon off-screen.
Hide
Type "export PATTY_CONFIG_PATH=/tmp/pattydemo/config.json" Enter
Type "export PATTY_DB_PATH=/tmp/pattydemo/patty.sqlite" Enter
Type "rm -rf /tmp/pattydemo && mkdir -p /tmp/pattydemo" Enter
Type "export NODE_NO_WARNINGS=1" Enter
Type "pattystack --fake=work:0.71 --fake=side:0.34 --fake=personal:0.08 > /tmp/pattydemo/patty.log 2>&1 &" Enter
Sleep 2s
Type `PATTY_API_KEY=$(sed -n 's/.*"apiKey":"\([^"]*\)".*/\1/p' /tmp/pattydemo/patty.log)` Enter
Ctrl+L
Show

# Start the visible demo on a clean terminal.
Sleep 300ms
Type "patty init $PATTY_API_KEY" Enter
Sleep 300ms

Type "patty status" Enter
Sleep 1.5s

Type `curl -s -D - localhost:3210/v1/chat/completions -H "authorization: Bearer $PATTY_API_KEY" -d '{"model":"gpt-5-codex","messages":[{"role":"user","content":"hi"}]}'` Enter
Sleep 1.5s

Type "patty usage" Enter
Sleep 2s
