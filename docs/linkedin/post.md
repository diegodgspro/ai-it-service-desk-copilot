I built an AI-Powered IT Service Desk Copilot to explore a practical support problem: turning an incomplete incident report into a consistent, reviewable troubleshooting plan.

This personal portfolio project combines my IT support perspective with Python, machine learning and safe automation design.

The workflow:
• Normalize an incoming ticket through an ITSM connector.
• Classify the issue with a lightweight local model.
• Recommend priority using impact and urgency.
• Retrieve relevant troubleshooting knowledge from Markdown runbooks.
• Present a working hypothesis, investigation steps and a technician response draft.
• Require human review before recording an automation simulation or a resolution decision.

The scenarios cover Active Directory lockouts, VPN, DNS, printers, Windows 11, Microsoft 365, shared folders and ERP access.

The dashboard uses Streamlit. PowerShell examples demonstrate endpoint diagnostics and guarded remediation. A working mock connector shows the integration contract; ServiceNow, Jira Service Management, GLPI and OTRS/ Znuny adapters are documented extension scaffolds. An optional Ollama provider can enrich response drafts with a local LLM.

This is a lab built with synthetic tickets. It has not been deployed at an employer. Classifier scores are uncalibrated, automation results are simulated, and I am not claiming production accuracy or measured time savings.

The attached visuals are demonstration summaries of the local workflow, not production screenshots.

The skills I wanted to make visible: incident prioritization, troubleshooting, knowledge management, escalation, Python, PowerShell and keeping technicians accountable for support decisions.

Code, setup and demonstration: [GITHUB_REPOSITORY_URL]

What would you want a support copilot to explain before trusting its recommendation?

#ITSupport #ServiceDesk #ITSM #Python #PowerShell
