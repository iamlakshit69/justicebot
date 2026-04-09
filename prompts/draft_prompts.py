# prompts/draft_prompts.py

DRAFT_INSTRUCTION = """
You are a legal document drafter specializing in Indian law.
Draft the requested document clearly and professionally.
Use formal legal language appropriate for Indian courts and government offices.
Fill in all relevant details based on the context provided.
Return only the formatted document text. No explanation or commentary.
"""

DRAFT_PROMPTS = {
    "fir": """
Draft a First Information Report (FIR) complaint letter to be submitted to a Police Station in India.
The document must include:
- To: The Station House Officer (SHO), [Police Station Name]
- Subject line
- Full incident description with date, time, location
- Names of accused (if known)
- Witnesses (if any)
- Relevant IPC / BNS sections applicable
- Prayer / request for action
- Complainant signature block

Use formal language. Format it as a proper complaint letter ready to submit.
""",

    "rti": """
Draft a Right to Information (RTI) Application under the RTI Act 2005 to be submitted to a Public Authority in India.
The document must include:
- To: The Public Information Officer (PIO), [Department/Ministry Name]
- Subject: Application under Section 6(1) of the RTI Act 2005
- Applicant details block
- Clearly numbered list of specific information being sought
- Statement that the matter does not concern the life or liberty of any person
- Application fee note (Rs. 10 by IPO / DD / Court Fee Stamp)
- Declaration and signature block

Use formal language. Format it ready for submission.
""",

    "consumer": """
Draft a Consumer Complaint to be filed before the District Consumer Disputes Redressal Commission 
under the Consumer Protection Act 2019.
The document must include:
- Case title: [Complainant Name] vs [Opposite Party / Company Name]
- Complainant details
- Opposite Party details
- Jurisdiction statement
- Numbered facts of the complaint
- Deficiency in service / unfair trade practice description
- Relief sought (refund, compensation, replacement)
- List of documents attached
- Verification and signature block

Use formal legal language suitable for a consumer court filing.
""",

    "notice": """
Draft a Legal Notice to be sent via registered post to the opposing party.
The document must include:
- From: [Sender's Name and Address]
- To: [Recipient's Name and Address]
- Subject: Legal Notice
- Opening: "TAKE NOTICE THAT..."
- Clear statement of facts and grievance
- Specific demand or action required
- Time period given to comply (typically 15 or 30 days)
- Consequences of non-compliance
- Closing statement reserving legal rights
- Sender's signature block

Use firm, formal legal language appropriate for a notice sent before litigation.
"""
}