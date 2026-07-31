.PHONY: demo build test lint typecheck

demo:
	@which vhs >/dev/null 2>&1 || (echo "vhs is required: https://github.com/charmbracelet/vhs" && exit 1)
	VHS_NO_SANDBOX=1 vhs demo/pattystack.tape

build:
	corepack pnpm -r build

test:
	corepack pnpm -r test

lint:
	corepack pnpm -r lint

typecheck:
	corepack pnpm -r typecheck
