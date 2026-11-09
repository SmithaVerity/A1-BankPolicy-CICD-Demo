# Jira story BP-1 — text to paste into Jira

Project: BP (BankPolicy Copilot) | Issue type: Story | All content is fictional.

**Summary** (paste into the Summary field):

```
Web chat answers cancellation, out-of-scope and fraud questions correctly
```

**Description** (paste into the Description field exactly as below; keep the straight double quotes):

```
As a customer-service employee, I want the BankPolicy Copilot web chat to answer policy questions correctly, so that I give customers the right next step.

Page: the BankPolicy Copilot web chat, lab build 1.2.1.

Acceptance criteria:
AC-01: Given the page is open, when nothing is typed, then the title reads "BankPolicy Copilot - web chat" and the instruction contains "Do not enter real customer data".
AC-02: Given the page is open, when the question "Can a settled international transfer be cancelled?" is typed and Ask is clicked, then within 5 seconds the answer contains "cannot be cancelled" and the citations contain "P02".
AC-03: Given the page is open, when the question "What will the weather be tomorrow?" is typed and Ask is clicked, then the answer contains "only approved bank policy questions" and the citations show "none".
AC-04: Given the page is open, when the question "The customer says the transfer was not authorised. What next?" is typed and Ask is clicked, then the status line contains "requires_escalation: true".
```

Expected pipeline result on lab build 1.2.1: AC-01, AC-02 and AC-03 pass; AC-04 fails (open defect DEF-104, fraud not escalated). A pipeline that passes AC-04 is wrong.
