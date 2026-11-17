# Ripple

**When one decision moves, see what moves with it.**

Live demo: https://keshvi-pipwala.github.io/ripple/

Shared team memory keeps decisions, owners and deadlines in one place for people and AI agents. Ripple looks at one specific case: a fact that depends on another fact. When a cutover date moves, the traffic deadline, the rollback window, the customer email and the legacy-login retirement date can all be wrong without anyone noticing. Ripple finds every linked fact and decides who has to act.

## How a change is handled

1. **The source of record changes.** A change from the system that owns a fact (here, the Jira ticket for the cutover) is applied and logged with its source.
2. **Rules handle the arithmetic.** Facts that are pure date math on another fact ("rollback window closes 3 days after 100% traffic") update themselves. No one needs to approve them.
3. **People own the decisions.** When a change breaks a decision or a deadline, it goes to that fact's owner with the reason and clear options. Facts further down the chain wait until the owner settles it.

Two more cases are covered:

- **An agent asks while a change is pending.** It gets the current value and a warning. If it plans around the proposed value, that is saved as an assumption, which is confirmed or rejected automatically when the owner decides.
- **A newer message contradicts the record.** A Slack message saying the date is slipping does not change memory. It goes to the owner, because newer is not automatically right.

## Try it

Open the live demo and follow the five guided steps. Each run takes about two minutes. Use **Reset demo** and choose differently, for example "Keep 9 Dec, challenge the cutover", to see the decision escalate to the cutover owner.

## What it leaves out

The links between facts are set by hand. In a real team, finding those links automatically from tickets, docs and chat is the hard part, and so is deciding which source is the record for each fact.

## Build and tests

- One HTML file, no frameworks, no build step and no external requests.
- `ripple.test.js` drives the page in headless Chrome through every path: the guided flow, the challenge-and-escalate path, a rejected assumption, a confirmed Slack claim, reset, the dependency map and a phone-sized layout. It also fails on any console error.

```bash
npm install
CHROME_PATH=/path/to/chrome npm test
```

All data, people and companies in the demo are fictional. This is an independent project and is not affiliated with any company or product.

Built by [Keshvi Pipwala](https://www.linkedin.com/in/keshvi-pipwala-5a7bb0247/).
