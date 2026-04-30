# prompts/draft_prompts.py

import json


# ── v2: Case-file-driven drafting ─────────────────────────────────────────────

DRAFT_SYSTEM_PROMPT = """
You are a senior legal document drafter with 20 years of experience in Indian courts.
You draft documents that lawyers would be proud of and judges take seriously.

PRINCIPLES:
- You draft REAL legal documents, not templates. Every document looks like it was
  prepared by a practising advocate.
- Use formal legal English throughout. Numbered paragraphs. Proper legal phrasing.
- Use the ACTUAL names, dates, amounts, and addresses from the case file.
- If a value is genuinely unknown, write "____" (four underscores) and nothing else.
  Never use placeholder brackets like [NAME] or [DATE].
- Bold the demand amount and key deadlines.

FORMAT RULES (follow these exactly):
- Start with "LEGAL NOTICE" or the document type as a centered heading
- Include "Via Registered Post / Speed Post" for notices
- Use proper date format: "10th April, 2026"
- Use numbered paragraphs (1., 2., 3., ...) for the body
- End with a proper closing: "Under the instructions from and on behalf of my client..."
- Include a signature block with name and address

Return only the document text. No explanation. No markdown fences.
"""


def build_draft_user_message(draft_type: str, case_file: dict) -> str:
    """Build a user message for the drafter using the full case file."""

    type_instructions = {
        "notice": (
            "Draft a LEGAL NOTICE to be sent via Registered Post.\n"
            "Structure:\n"
            "- Header: LEGAL NOTICE (centered)\n"
            "- Sub-header: Via Registered Post / Speed Post\n"
            "- Date line\n"
            "- From: Sender's full name and address\n"
            "- To: Recipient's full name and address\n"
            "- Subject: Legal Notice under [relevant Act]\n"
            "- Opening: 'Under the instructions from and on behalf of my client...'\n"
            "- Body: Numbered paragraphs with full facts, specific legal sections cited,\n"
            "  and the specific demand (with bold amount)\n"
            "- Deadline: 15 or 30 days to comply\n"
            "- Consequences: 'Failure to comply... civil and criminal proceedings'\n"
            "- Closing: 'This notice is sent without prejudice to any rights...'\n"
            "- Signature block\n"
        ),
        "fir": (
            "Draft an FIR COMPLAINT LETTER to be submitted at a Police Station.\n"
            "Structure:\n"
            "- To: The Station House Officer (SHO), [Police Station]\n"
            "- Subject: Complaint under [IPC/BNS sections]\n"
            "- Body: Full incident with date, time, location, accused details\n"
            "- Relevant sections of IPC/BNS with brief description\n"
            "- Prayer: Request for FIR registration and investigation\n"
            "- Signature block with phone number\n"
        ),
        "rti": (
            "Draft an RTI APPLICATION under the Right to Information Act, 2005.\n"
            "Structure:\n"
            "- To: The Public Information Officer (PIO), [Department]\n"
            "- Subject: Application under Section 6(1) of RTI Act, 2005\n"
            "- Body: Numbered list of specific information sought\n"
            "- Fee: Rs. 10 enclosed via IPO/DD/Court Fee Stamp\n"
            "- Declaration under Section 6(2)\n"
            "- Signature block\n"
        ),
        "consumer": (
            "Draft a CONSUMER COMPLAINT under Consumer Protection Act, 2019.\n"
            "Structure:\n"
            "- Before: District Consumer Disputes Redressal Commission\n"
            "- Case title format\n"
            "- Parties: Complainant and Opposite Party with full details\n"
            "- Jurisdiction statement\n"
            "- Numbered facts (at least 5-8 detailed paragraphs)\n"
            "- Deficiency in service / unfair trade practice\n"
            "- Relief sought with specific amounts\n"
            "- List of annexed documents\n"
            "- Verification and signature\n"
        ),
    }

    specific = type_instructions.get(draft_type, type_instructions["notice"])

    return (
        f"{specific}\n\n"
        f"CASE FILE:\n{json.dumps(case_file, indent=2)}\n\n"
        "Use the actual names, dates, and amounts from the case file.\n"
        "Make this document look like it was drafted by a senior advocate."
    )