# VHS demo for Pattystack
# Render: vhs demo/pattystack.tape

Output demo/pattystack.gif
Output demo/pattystack.webm

Set Shell "bash"
Set FontSize 28
Set Width 1200
Set Height 700
Set Theme "Catppuccin Mocha"
Set WindowBar Colorful
Set TypingSpeed 50ms

# Prepare an isolated demo environment without touching the operator's real config.
Hide
Type "export PATTY_CONFIG_PATH=/tmp/pattydemo/config.json" Enter
Type "export PATTY_DB_PATH=/tmp/pattydemo/patty.sqlite" Enter
Type "rm -rf /tmp/pattydemo && mkdir -p /tmp/pattydemo" Enter
Type "export NODE_NO_WARNINGS=1" Enter
Show

# Three plans. One endpoint.
Type "# three plans. one endpoint." Enter
Sleep 500ms

Type "pattystack --fake=work:0.71 --fake=side:0.34 --fake=personal:0.08 > /tmp/pattydemo/patty.log 2>&1 &" Enter
Sleep 3s

# Extract the one-time key and save it for the CLI.
Hide
Type `PATTY_API_KEY=$(grep -oP '"apiKey":"\K[^"]+' /tmp/pattydemo/patty.log)` Enter
Show

Type "patty init $PATTY_API_KEY" Enter
Sleep 500ms

Type "patty status" Enter
Sleep 500ms

Type `curl -s -D - localhost:3210/v1/chat/completions -H "authorization: Bearer $PATTY_API_KEY" -d '{"model":"gpt-5-codex","messages":[{"role":"user","content":"hi"}]}'` Enter
Sleep 2s

# Fire a small burst to show the endpoint keeps answering.
Type `for i in {1..10}; do curl -s localhost:3210/v1/chat/completions -H "authorization: Bearer $PATTY_API_KEY" -d '{"model":"gpt-5-codex","messages":[{"role":"user","content":"hello '$i'"}]}' > /dev/null; done` Enter
Sleep 3s

Type "patty usage" Enter
Sleep 3s
