import os

# project_config.py

# ==============================================================================
# STATIC BOSS FLOORS
# ==============================================================================
ASC_BOSS_DATA = {
    "asc1": {
        11: {'tier': 'dirt1'}, 17: {'tier': 'com1'}, 23: {'tier': 'dirt2'},
        25: {'tier': 'rare1'}, 29: {'tier': 'epic1'}, 31: {'tier': 'leg1'},
        34: {
            'tier': 'mixed', 
            'special': {
                0: 'com3', 1: 'com3', 2: 'com3', 3: 'com3', 4: 'com3', 5: 'com3',
                6: 'com3', 7: 'com3', 8: 'myth1', 9: 'myth1', 10: 'com3', 11: 'com3',
                12: 'com3', 13: 'com3', 14: 'myth1', 15: 'myth1', 16: 'com3', 17: 'com3',
                18: 'com3', 19: 'com3', 20: 'com3', 21: 'com3', 22: 'com3', 23: 'com3'
            }
        },
        35: {'tier': 'rare2'}, 41: {'tier': 'epic2'}, 44: {'tier': 'leg2'},
        49: {
        "tier": "mixed",
        "special": {
            0: "dirt3", 1: "dirt3", 2: "dirt3", 3: "dirt3", 4: "dirt3", 5: "dirt3",
            6: "com3",  7: "com3",  8: "com3",  9: "com3",  10: "com3", 11: "com3",
            12: "rare3", 13: "rare3", 14: "rare3", 15: "rare3", 16: "rare3", 17: "rare3",
            18: "myth2", 19: "myth2", 20: "myth2", 21: "myth2", 22: "myth2", 23: "myth2"
        }
        },
        74: {
            'tier': 'mixed', 
            'special': {
                0: 'dirt3', 1: 'dirt3', 2: 'dirt3', 3: 'dirt3', 4: 'dirt3', 5: 'dirt3',
                6: 'dirt3', 7: 'dirt3', 8: 'dirt3', 9: 'dirt3', 10: 'dirt3', 11: 'dirt3',
                12: 'dirt3', 13: 'dirt3', 14: 'dirt3', 15: 'dirt3', 16: 'dirt3', 17: 'dirt3',
                18: 'dirt3', 19: 'dirt3', 20: 'div1', 21: 'div1', 22: 'dirt3', 23: 'dirt3'
            }
        },
        98: {'tier': 'myth3'},
        99: {
        "tier": "mixed",
        "special": {
            0: "com3", 1: "rare3", 2: "epic3", 3: "leg3", 4: "myth3", 5: "div2",
            6: "com3",  7: "rare3",  8: "epic3",  9: "leg3",  10: "myth3", 11: "div2",
            12: "com3", 13: "rare3", 14: "epic3", 15: "leg3", 16: "myth3", 17: "div2",
            18: "com3", 19: "rare3", 20: "epic3", 21: "leg3", 22: "myth3", 23: "div2"
        }
        }
    },
    "asc2": {
        11: {'tier': 'dirt1'}, 17: {'tier': 'com1'}, 23: {'tier': 'dirt2'},
        25: {'tier': 'rare1'}, 29: {'tier': 'epic1'}, 31: {'tier': 'leg1'},
        34: {
            'tier': 'mixed', 
            'special': {
                0: 'com3', 1: 'com3', 2: 'com3', 3: 'com3', 4: 'com3', 5: 'com3',
                6: 'com3', 7: 'com3', 8: 'myth1', 9: 'myth1', 10: 'com3', 11: 'com3',
                12: 'com3', 13: 'com3', 14: 'myth1', 15: 'myth1', 16: 'com3', 17: 'com3',
                18: 'com3', 19: 'com3', 20: 'com3', 21: 'com3', 22: 'com3', 23: 'com3'
            }
        },
        35: {'tier': 'rare2'}, 41: {'tier': 'epic2'}, 44: {'tier': 'leg2'},
        49: {
        "tier": "mixed",
        "special": {
            0: "dirt3", 1: "dirt3", 2: "dirt3", 3: "dirt3", 4: "dirt3", 5: "dirt3",
            6: "com3",  7: "com3",  8: "com3",  9: "com3",  10: "com3", 11: "com3",
            12: "rare3", 13: "rare3", 14: "rare3", 15: "rare3", 16: "rare3", 17: "rare3",
            18: "myth2", 19: "myth2", 20: "myth2", 21: "myth2", 22: "myth2", 23: "myth2"
        }
        },
        74: {
            'tier': 'mixed', 
            'special': {
                0: 'dirt3', 1: 'dirt3', 2: 'dirt3', 3: 'dirt3', 4: 'dirt3', 5: 'dirt3',
                6: 'dirt3', 7: 'dirt3', 8: 'dirt3', 9: 'dirt3', 10: 'dirt3', 11: 'dirt3',
                12: 'dirt3', 13: 'dirt3', 14: 'dirt3', 15: 'dirt3', 16: 'dirt3', 17: 'dirt3',
                18: 'dirt3', 19: 'dirt3', 20: 'div1', 21: 'div1', 22: 'dirt3', 23: 'dirt3'
            }
        },
        80: {'tier': 'dirt3'}, 95: {'tier': 'com3'},
        98: {'tier': 'myth3'},
        99: {
            "tier": "mixed",
            "special": {
                0: "com4", 1: "rare3", 2: "epic3", 3: "leg3", 4: "myth3", 5: "div2",
                6: "com4",  7: "rare3",  8: "epic3",  9: "leg3",  10: "myth3", 11: "div2",
                12: "com4", 13: "rare3", 14: "epic3", 15: "leg3", 16: "myth3", 17: "div2",
                18: "com4", 19: "rare3", 20: "epic3", 21: "leg3", 22: "myth3", 23: "div2"
            },
        },
        110: {'tier': 'rare3'}, 125: {'tier': 'epic3'}, 135: {'tier': 'leg3'}, 
        140: {'tier': 'myth3'}, 149: {'tier': 'div3'}
    }
}

# ==============================================================================
# ORE APPEARANCE RANGES
# Format: 'block_id': (min_floor, max_floor)
# ==============================================================================
ASC_ORE_RESTRICTIONS = {
    "asc1": {
        'dirt1': (1, 11), 'com1': (1, 17), 'rare1': (3, 25), 'epic1': (6, 29), 'leg1': (12, 31), 'myth1': (20, 34), 'div1': (50, 74),
        'dirt2': (12, 23), 'com2': (18, 28), 'rare2': (26, 35), 'epic2': (30, 41), 'leg2': (32, 44), 'myth2': (36, 49), 'div2': (75, 99),
        'dirt3': (24, 999), 'com3': (30, 999), 'rare3': (36, 999), 'epic3': (42, 999), 'leg3': (45, 999), 'myth3': (50, 999), 'div3': (100, 999)
    },
    "asc2": {
        'dirt1': (1, 11), 'com1': (1, 17), 'rare1': (3, 25), 'epic1': (6, 29), 'leg1': (12, 31), 'myth1': (20, 34), 'div1': (50, 74),
        'dirt2': (12, 23), 'com2': (18, 28), 'rare2': (26, 35), 'epic2': (30, 41), 'leg2': (32, 44), 'myth2': (36, 49), 'div2': (75, 99),
        'dirt3': (24, 80), 'com3': (30, 95), 'rare3': (36, 110), 'epic3': (42, 125), 'leg3': (45, 135), 'myth3': (50, 140), 'div3': (100, 149),
        'dirt4': (81, 999), 'com4': (96, 999), 'rare4': (111, 999), 'epic4': (126, 999), 'leg4': (136, 999), 'myth4': (141, 999), 'div4': (150, 999)
    }
}

# --- 1. PROJECT ROOT CALCULATION ---
# This allows scripts in subfolders to find the root regardless of where they are run
PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))

# --- 2. DATA DIRECTORY MAPPING ---
DATA_DIRS = {
    "RAW": os.path.join(PROJECT_ROOT, "Data_00_Raw_Captures"),
    "REF": os.path.join(PROJECT_ROOT, "Data_01_Reference"),
    "TRACKING": os.path.join(PROJECT_ROOT, "Data_02_Tracking_Archive"),
    "SURGICAL": os.path.join(PROJECT_ROOT, "Data_03_Surgical_Mining_Results"),
    "CALIB": os.path.join(PROJECT_ROOT, "Data_04_Calibration_Vault"),
    "INVEST": os.path.join(PROJECT_ROOT, "Data_05_Investigation_Archives")
}

# --- 3. PATH HELPERS ---
def get_buffer_path(buffer_id=4):
    """Returns absolute path to a specific capture buffer."""
    return os.path.join(DATA_DIRS["RAW"], f"capture_buffer_{buffer_id}")

def get_ref_path(filename):
    """Returns absolute path to a file in the Reference/Ground Truth folder."""
    return os.path.join(DATA_DIRS["REF"], filename)

# Template/Digit Libraries
TEMPLATE_DIR = os.path.join(DATA_DIRS["REF"], "templates")
DIGIT_DIR = os.path.join(DATA_DIRS["REF"], "digits")

# --- 4. SHARED GAME CONSTANTS ---
ORE_RESTRICTIONS = ASC_ORE_RESTRICTIONS["asc1"]
BOSS_DATA = ASC_BOSS_DATA["asc1"]


# Base stats for every block. 
# hp = Health, xp = Base XP, a = Armor, ft = Fragment Type (e.g., 0-6), fa = Fragment Amount
# project_config.py

# ==============================================================================
# ORE BASE STATS & SCALING BREAKPOINTS
# ft = Fragment Type (0: Dirt, 1: Com, 2: Rare, 3: Epic, 4: Leg, 5: Myth, 6: Div)
# fa = Fragment Amount
# ==============================================================================
BLOCK_BASE_STATS = {
    # ----------------------------------- TIER 1 -----------------------------------
    'dirt1': {'hp': 100,   'xp': 0.05, 'a': 0,   'ft': 0, 'fa': 0},
    'com1':  {'hp': 250,   'xp': 0.15, 'a': 5,   'ft': 1, 'fa': 0.01},
    'rare1': {'hp': 550,   'xp': 0.35, 'a': 12,  'ft': 2, 'fa': 0.01},
    'epic1': {'hp': 1150,  'xp': 1.0,  'a': 25,  'ft': 3, 'fa': 0.01},
    'leg1':  {'hp': 1950,  'xp': 3.5,  'a': 50,  'ft': 4, 'fa': 0.01},
    'myth1': {'hp': 3500,  'xp': 7.5,  'a': 150, 'ft': 5, 'fa': 0.01},
    'div1':  {'hp': 25000, 'xp': 20.0, 'a': 300, 'ft': 6, 'fa': 0.01},

    # ----------------------------------- TIER 2 -----------------------------------
    'dirt2': {'hp': 300,   'xp': 0.15, 'a': 0,   'ft': 0, 'fa': 0},
    'com2':  {'hp': 750,   'xp': 0.45, 'a': 8,   'ft': 1, 'fa': 0.02},
    'rare2': {'hp': 1650,  'xp': 1.05, 'a': 20,  'ft': 2, 'fa': 0.02},
    'epic2': {'hp': 3450,  'xp': 3.0,  'a': 41,  'ft': 3, 'fa': 0.02},
    'leg2':  {'hp': 5850,  'xp': 10.5, 'a': 83,  'ft': 4, 'fa': 0.02},
    'myth2': {'hp': 10500, 'xp': 22.5, 'a': 248, 'ft': 5, 'fa': 0.02},
    'div2':  {'hp': 75000, 'xp': 60.0, 'a': 495, 'ft': 6, 'fa': 0.02},

    # ----------------------------------- TIER 3 -----------------------------------
    'dirt3': {'hp': 900,   'xp': 0.45, 'a': 0,   'ft': 0, 'fa': 0},
    'com3':  {'hp': 2250,  'xp': 1.35, 'a': 14,  'ft': 1, 'fa': 0.04},
    'rare3': {'hp': 4950,  'xp': 3.15, 'a': 33,  'ft': 2, 'fa': 0.04},
    'epic3': {'hp': 10350, 'xp': 9.0,  'a': 68,  'ft': 3, 'fa': 0.04},
    'leg3':  {'hp': 17550, 'xp': 31.5, 'a': 136, 'ft': 4, 'fa': 0.04},
    'myth3': {'hp': 31500, 'xp': 67.5, 'a': 408, 'ft': 5, 'fa': 0.04},
    'div3':  {'hp': 225000,'xp': 180.0,'a': 817, 'ft': 6, 'fa': 0.04},

    # ----------------------------------- TIER 4 -----------------------------------
    'dirt4': {'hp': 2700,  'xp': 1.35, 'a': 0,   'ft': 0, 'fa': 0},
    'com4':  {'hp': 6750,  'xp': 4.05, 'a': 22,  'ft': 1, 'fa': 0.08},
    'rare4': {'hp': 14850, 'xp': 9.45, 'a': 54,  'ft': 2, 'fa': 0.08},
    'epic4': {'hp': 31050, 'xp': 27.0, 'a': 112, 'ft': 3, 'fa': 0.08},
    'leg4':  {'hp': 52650, 'xp': 94.5, 'a': 225, 'ft': 4, 'fa': 0.08},
    'myth4': {'hp': 94500, 'xp': 202.5,'a': 674, 'ft': 5, 'fa': 0.08},
    'div4':  {'hp': 675000,'xp': 540.0,'a': 1348,'ft': 6, 'fa': 0.08}
}

BASE_STAT_CAPS = {
    'Str': 50,
    'Agi': 50,
    'Per': 25,
    'Int': 25,
    'Luck': 25,
    'Div': 10,
    'Corr': 10
}

# ==============================================================================
# UPGRADE CAPS
# Defines the absolute maximum level a player can invest into an upgrade.
# ==============================================================================
INTERNAL_UPGRADE_CAPS = {
    3: 50,  4: 25,  5: 25, 8: 3,  9: 25,  10: 25, 11: 25, 12: 5,  13: 25, 
    14: 20, 15: 20, 16: 10, 17: 15, 18: 15, 19: 30, 20: 25, 21: 20, 
    22: 10, 23: 5,  24: 30, 25: 5,  26: 5,  27: 30,  28: 15, 29: 10, 
    30: 20, 31: 10, 32: 5,  33: 5,  34: 5, 35: 5,  36: 20, 37: 20, 
    38: 20, 39: 20, 40: 20, 41: 1,  42: 1,  43: 1,  44: 1,  45: 1,  
    46: 30, 47: 1,  48: 5,  49: 5,  50: 25, 51: 5,  52: 10, 53: 40, 
    54: 50, 55: 10
}

# ==============================================================================
# EXTERNAL UPGRADE UI GROUPS
# Maps unified UI controls (like a single checkbox) to multiple engine rows.
# ==============================================================================
EXTERNAL_UI_GROUPS =[
    {"id": "hestia", "name": "Hestia Idol", "rows": [4], "ui_type": "number", "max": 9999, "img": "4_hestia.png"},
    {"id": "axolotl", "name": "Axolotl Skin", "rows": [5], "ui_type": "pet", "max": 11, "img": "5_axolotl.png"},
    {"id": "dino", "name": "Dino Skin", "rows":[6, 7], "ui_type": "pet", "max": 11, "img": "6_7_dino.png"},
    {"id": "geoduck", "name": "Geoduck Tribute", "rows": [8], "ui_type": "number", "max": 9999, "img": "8_geoduck.png"},
    {"id": "avada", "name": "Avada Keda- Skill", "rows": [9, 10, 11], "ui_type": "skill", "imgs":["9_11_avada-keda_1.png", "9_11_avada-keda_2.png"]},
    {"id": "block", "name": "Block Bonker Skill", "rows":[12, 13, 14], "ui_type": "skill", "imgs":["12_14_block-bonker_1.png", "12_14_block-bonker_2.png"]},
    {"id": "arch_bundle", "name": "Archaeology Bundle", "rows": [15], "ui_type": "bundle"},
    {"id": "asc_bundle", "name": "Ascension Bundle", "rows": [16, 17, 18, 19], "ui_type": "bundle"},
    {"id": "arch_card", "name": "Arch Ability Card", "rows":[20], "ui_type": "card", "max": 4}
]