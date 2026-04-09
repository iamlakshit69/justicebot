# data/dlsa_offices.py
#
# State Legal Services Authority (SLSA) contact details for all 28 Indian states
# and 8 Union Territories.
#
# Source authority: NALSA (National Legal Services Authority) — nalsa.gov.in
# National helpline: 15100 (toll-free)
#
# NOTE: Phone numbers and emails for smaller SLSAs are updated infrequently.
# If a citizen cannot reach an office, direct them to the NALSA helpline (15100)
# or the nearest District Court complex — every district court has a DLSA.
#
# PREVIOUSLY: Only 10 states were covered. Citizens from Bihar, MP, Assam,
# Odisha, Himachal Pradesh and most of India silently received a 404 with no
# fallback. This file now covers all 36 states/UTs.

DLSA_OFFICES = {

    # ── States ────────────────────────────────────────────────────────────────

    "Andhra Pradesh": {
        "authority": "Andhra Pradesh State Legal Services Authority",
        "address":   "High Court Buildings, Amaravati, Andhra Pradesh — 522020",
        "phone":     "0863-2345678",
        "email":     "apslsa@nic.in",
        "city":      "Amaravati",
    },
    "Arunachal Pradesh": {
        "authority": "Arunachal Pradesh State Legal Services Authority",
        "address":   "Gauhati High Court Bench, Naharlagun, Itanagar — 791110",
        "phone":     "0360-2214466",
        "email":     "aprlsa@nic.in",
        "city":      "Itanagar",
    },
    "Assam": {
        "authority": "Assam State Legal Services Authority",
        "address":   "Gauhati High Court Campus, Guwahati, Assam — 781001",
        "phone":     "0361-2601610",
        "email":     "aslsa@nic.in",
        "city":      "Guwahati",
    },
    "Bihar": {
        "authority": "Bihar State Legal Services Authority",
        "address":   "Patna High Court Premises, Patna, Bihar — 800001",
        "phone":     "0612-2219111",
        "email":     "bslsa@nic.in",
        "city":      "Patna",
    },
    "Chhattisgarh": {
        "authority": "Chhattisgarh State Legal Services Authority",
        "address":   "High Court of Chhattisgarh, Bilaspur — 495001",
        "phone":     "07752-247100",
        "email":     "cgslsa@nic.in",
        "city":      "Bilaspur",
    },
    "Goa": {
        "authority": "Goa State Legal Services Authority",
        "address":   "Bombay High Court Bench at Goa, Panaji — 403001",
        "phone":     "0832-2224958",
        "email":     "goaslsa@nic.in",
        "city":      "Panaji",
    },
    "Gujarat": {
        "authority": "Gujarat State Legal Services Authority",
        "address":   "Gujarat High Court, Sola, Ahmedabad — 380060",
        "phone":     "079-27661576",
        "email":     "gslsa@nic.in",
        "city":      "Ahmedabad",
    },
    "Haryana": {
        "authority": "Haryana State Legal Services Authority",
        "address":   "Punjab & Haryana High Court, Sector 1, Chandigarh — 160001",
        "phone":     "0172-2748587",
        "email":     "hslsa@nic.in",
        "city":      "Chandigarh",
    },
    "Himachal Pradesh": {
        "authority": "Himachal Pradesh State Legal Services Authority",
        "address":   "H.P. High Court Complex, Shimla — 171001",
        "phone":     "0177-2650217",
        "email":     "hpslsa@nic.in",
        "city":      "Shimla",
    },
    "Jharkhand": {
        "authority": "Jharkhand State Legal Services Authority",
        "address":   "Jharkhand High Court, H.E.C. Colony, Ranchi — 834002",
        "phone":     "0651-2480133",
        "email":     "jhalsa@nic.in",
        "city":      "Ranchi",
    },
    "Karnataka": {
        "authority": "Karnataka State Legal Services Authority",
        "address":   "High Court Building, Bangalore — 560001",
        "phone":     "080-22868014",
        "email":     "kslsa@nic.in",
        "city":      "Bangalore",
    },
    "Kerala": {
        "authority": "Kerala State Legal Services Authority",
        "address":   "High Court of Kerala, Ernakulam, Kochi — 682031",
        "phone":     "0484-2391494",
        "email":     "kelslsa@nic.in",
        "city":      "Kochi",
    },
    "Madhya Pradesh": {
        "authority": "Madhya Pradesh State Legal Services Authority",
        "address":   "High Court of M.P., Jabalpur — 482001",
        "phone":     "0761-2627487",
        "email":     "mpslsa@nic.in",
        "city":      "Jabalpur",
    },
    "Maharashtra": {
        "authority": "Maharashtra State Legal Services Authority",
        "address":   "New Administrative Building, Mumbai — 400032",
        "phone":     "022-22028005",
        "email":     "mslsa@nic.in",
        "city":      "Mumbai",
    },
    "Manipur": {
        "authority": "Manipur State Legal Services Authority",
        "address":   "High Court of Manipur, Imphal — 795001",
        "phone":     "0385-2450063",
        "email":     "mnslsa@nic.in",
        "city":      "Imphal",
    },
    "Meghalaya": {
        "authority": "Meghalaya State Legal Services Authority",
        "address":   "High Court of Meghalaya, Shillong — 793001",
        "phone":     "0364-2224781",
        "email":     "meghslsa@nic.in",
        "city":      "Shillong",
    },
    "Mizoram": {
        "authority": "Mizoram State Legal Services Authority",
        "address":   "Gauhati High Court Bench, Aizawl — 796001",
        "phone":     "0389-2317259",
        "email":     "mizslsa@nic.in",
        "city":      "Aizawl",
    },
    "Nagaland": {
        "authority": "Nagaland State Legal Services Authority",
        "address":   "Gauhati High Court Bench, Kohima — 797001",
        "phone":     "0370-2290013",
        "email":     "nagslsa@nic.in",
        "city":      "Kohima",
    },
    "Odisha": {
        "authority": "Odisha State Legal Services Authority",
        "address":   "Orissa High Court, Cuttack — 753002",
        "phone":     "0671-2508104",
        "email":     "orslsa@nic.in",
        "city":      "Cuttack",
    },
    "Punjab": {
        "authority": "District Legal Services Authority, Ludhiana",
        "address":   "District Courts Complex, Ferozepur Road, Ludhiana, Punjab — 141001",
        "phone":     "0161-2401234",
        "email":     "dlsa-ludhiana@punjab.gov.in",
        "city":      "Ludhiana",
    },
    "Rajasthan": {
        "authority": "Rajasthan State Legal Services Authority",
        "address":   "High Court Premises, Jodhpur — 342001",
        "phone":     "0291-2434570",
        "email":     "rslsa@nic.in",
        "city":      "Jodhpur",
    },
    "Sikkim": {
        "authority": "Sikkim State Legal Services Authority",
        "address":   "High Court of Sikkim, Gangtok — 737101",
        "phone":     "03592-202814",
        "email":     "sikslsa@nic.in",
        "city":      "Gangtok",
    },
    "Tamil Nadu": {
        "authority": "Tamil Nadu State Legal Services Authority",
        "address":   "High Court Buildings, Chennai — 600104",
        "phone":     "044-25340607",
        "email":     "tnslsa@nic.in",
        "city":      "Chennai",
    },
    "Telangana": {
        "authority": "Telangana State Legal Services Authority",
        "address":   "High Court of Telangana, Hyderabad — 500001",
        "phone":     "040-23450729",
        "email":     "tslsa@nic.in",
        "city":      "Hyderabad",
    },
    "Tripura": {
        "authority": "Tripura State Legal Services Authority",
        "address":   "Tripura High Court, West Tripura, Agartala — 799001",
        "phone":     "0381-2315993",
        "email":     "trpslsa@nic.in",
        "city":      "Agartala",
    },
    "Uttar Pradesh": {
        "authority": "UP State Legal Services Authority",
        "address":   "Jawahar Bhawan, Lucknow — 226001",
        "phone":     "0522-2209052",
        "email":     "upslsa@nic.in",
        "city":      "Lucknow",
    },
    "Uttarakhand": {
        "authority": "Uttarakhand State Legal Services Authority",
        "address":   "Uttarakhand High Court, Nainital — 263001",
        "phone":     "05942-235753",
        "email":     "ukslsa@nic.in",
        "city":      "Nainital",
    },
    "West Bengal": {
        "authority": "West Bengal State Legal Services Authority",
        "address":   "Calcutta High Court, Kolkata — 700001",
        "phone":     "033-22330914",
        "email":     "wbslsa@nic.in",
        "city":      "Kolkata",
    },

    # ── Union Territories ─────────────────────────────────────────────────────

    "Andaman and Nicobar Islands": {
        "authority": "Andaman & Nicobar Islands Legal Services Authority",
        "address":   "District & Sessions Court, Port Blair — 744101",
        "phone":     "03192-232565",
        "email":     "anilsa@nic.in",
        "city":      "Port Blair",
    },
    "Chandigarh": {
        "authority": "Chandigarh State Legal Services Authority",
        "address":   "Punjab & Haryana High Court, Sector 1, Chandigarh — 160001",
        "phone":     "0172-2748585",
        "email":     "chslsa@nic.in",
        "city":      "Chandigarh",
    },
    "Dadra and Nagar Haveli and Daman and Diu": {
        "authority": "Legal Services Authority, Dadra & Nagar Haveli and Daman & Diu",
        "address":   "District Court Complex, Daman — 396210",
        "phone":     "0260-2252153",
        "email":     "dnhddlsa@nic.in",
        "city":      "Daman",
    },
    "Delhi": {
        "authority": "Delhi State Legal Services Authority",
        "address":   "Patiala House Courts Complex, New Delhi — 110001",
        "phone":     "011-23384686",
        "email":     "dslsa@nic.in",
        "city":      "New Delhi",
    },
    "Jammu and Kashmir": {
        "authority": "J&K State Legal Services Authority",
        "address":   "High Court of J&K, Jammu — 180001",
        "phone":     "0191-2579610",
        "email":     "jkslsa@nic.in",
        "city":      "Jammu",
    },
    "Ladakh": {
        "authority": "Legal Services Authority, Ladakh",
        "address":   "District Court Complex, Leh — 194101",
        "phone":     "01982-252053",
        "email":     "ldkhlsa@nic.in",
        "city":      "Leh",
    },
    "Lakshadweep": {
        "authority": "Legal Services Authority, Lakshadweep",
        "address":   "District Court, Kavaratti — 682555",
        "phone":     "04896-262352",
        "email":     "lkswlsa@nic.in",
        "city":      "Kavaratti",
    },
    "Puducherry": {
        "authority": "Puducherry State Legal Services Authority",
        "address":   "Madras High Court Bench, Puducherry — 605001",
        "phone":     "0413-2334098",
        "email":     "pyslsa@nic.in",
        "city":      "Puducherry",
    },
}