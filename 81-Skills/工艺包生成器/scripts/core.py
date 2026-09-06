"""
cbec-tech-pack-generator - Tech Pack Generator core logic.

Generates factory-ready technical packages with DFM reviews, maternal compliance
checks, BOM structures, factory QA templates, and full tech pack output.
"""

from __future__ import annotations

from typing import Any


# ──────────────────────────────────────────────
# Material-Specific DFM Rules
# ──────────────────────────────────────────────

_DFM_RULES: dict[str, list[dict]] = {
    "injection_mold": [
        {"issue": "draft_angle_insufficient", "check": "draft_angle < 1 degree", "severity": "high",
         "fix": "Increase draft angle to 1-3 degrees for easier ejection"},
        {"issue": "wall_thickness_variation", "check": "wall thickness varies > 40% between adjacent walls", "severity": "high",
         "fix": "Maintain uniform wall thickness, target max 40% variation"},
        {"issue": "sharp_inside_corner", "check": "inside radius < 0.5x wall thickness", "severity": "medium",
         "fix": "Add radius at least 0.5x wall thickness to reduce stress concentration"},
        {"issue": "undercut_detected", "check": "features requiring side-action or lifter", "severity": "medium",
         "fix": "Redesign to avoid undercuts or plan for side-action mechanism"},
        {"issue": "sink_mark_risk", "check": "thick sections (> 2x adjacent wall) adjacent to thin sections", "severity": "medium",
         "fix": "Core out thick sections or use gas-assist molding"},
        {"issue": "boss_design", "check": "boss without gusset or with inadequate wall thickness", "severity": "medium",
         "fix": "Add gussets, keep boss wall thickness at 60% of nominal wall"},
        {"issue": "rib_design", "check": "rib thickness > 0.6x nominal wall", "severity": "low",
         "fix": "Keep rib thickness at 50-60% of nominal wall to prevent sink"},
        {"issue": "parting_line", "check": "parting line location may cause flash", "severity": "low",
         "fix": "Locate parting line along natural edge, specify flash tolerance"},
        {"issue": "ejector_pin_mark", "check": "ejector pins on visible/cosmetic surfaces", "severity": "medium",
         "fix": "Move ejector pins to non-cosmetic surfaces or add cosmetic texture"},
    ],
    "silicone": [
        {"issue": "tear_resistance", "check": "sharp corner or thin section (< 0.5mm) in high-stress area", "severity": "high",
         "fix": "Increase corner radius, minimum wall thickness 0.8mm for LSR"},
        {"issue": "de-molding_sticking", "check": "high aspect ratio feature or deep cavity", "severity": "high",
         "fix": "Increase draft angle to 3-5 degrees for silicone, use mold release"},
        {"issue": "air_trap", "check": "complex geometry with potential gas entrapment", "severity": "medium",
         "fix": "Add venting channels at last fill points"},
        {"issue": "flash", "check": "parting line in non-planar area", "severity": "medium",
         "fix": "Planarize parting line, specify flash tolerance < 0.1mm"},
        {"issue": "color_consistency", "check": "color change across batches required", "severity": "medium",
         "fix": "Specify color masterbatch, require first-article color measurement report"},
        {"issue": "shelf_life", "check": "material degradation concern for long-term storage", "severity": "low",
         "fix": "Specify storage conditions, shelf life, and post-cure requirements"},
    ],
    "textile": [
        {"issue": "seam_strength", "check": "seam type not specified for load-bearing area", "severity": "high",
         "fix": "Specify seam type (flatlock, overlock, bound) and stitch density"},
        {"issue": "shrinkage", "check": "fabric composition without pre-shrink treatment", "severity": "high",
         "fix": "Specify pre-shrink or wash test per AATCC 135, max 3% shrinkage"},
        {"issue": "fraying", "check": "raw edges without finishing", "severity": "medium",
         "fix": "Specify edge finishing: overlock, hem, or binding"},
        {"issue": "color_fastness", "check": "dark/deep colors without fastness specification", "severity": "medium",
         "fix": "Specify color fastness test per ISO 105 (min grade 4 for rubbing, grade 3-4 for light)"},
        {"issue": "pilling", "check": "fabric prone to pilling in friction areas", "severity": "medium",
         "fix": "Specify pilling resistance test per ASTM D4970 / ISO 12945"},
        {"issue": "size_consistency", "check": "multiple sizes without grade rules", "severity": "low",
         "fix": "Provide full size grading spec with tolerance per size ± 0.5cm"},
    ],
    "small_appliance": [
        {"issue": "creepage_distance", "check": "PCB-to-enclosure distance < required for voltage", "severity": "high",
         "fix": "Maintain minimum 3mm creepage for 120V, 5mm for 240V"},
        {"issue": "thermal_management", "check": "heat-generating component near enclosure wall", "severity": "high",
         "fix": "Add thermal barrier, heat sink, or ventilation slots"},
        {"issue": "drop_test", "check": "product weight > 1kg without impact protection", "severity": "high",
         "fix": "Design for 1m drop test, add foam padding or reinforced corners"},
        {"issue": "cable_strain_relief", "check": "power cord exit without strain relief", "severity": "medium",
         "fix": "Add strain relief bushing at cable exit point per UL 817"},
        {"issue": "water_ingress", "check": "seam/gap near liquid path", "severity": "medium",
         "fix": "Add gasket, specify IP rating (min IPX4 for kitchen/maternity use)"},
        {"issue": "button_tactility", "check": "membrane button without tactile feedback spec", "severity": "low",
         "fix": "Specify actuation force (2-5N), travel distance (0.3-1.0mm), click ratio"},
        {"issue": "pcb_ mounting", "check": "PCB without support standoffs at vibration points", "severity": "medium",
         "fix": "Add mounting bosses at 4 corners, minimum 3mm height"},
    ],
    "wood": [
        {"issue": "moisture_content", "check": "wood type without moisture specification", "severity": "high",
         "fix": "Specify moisture content range 6-12% depending on wood type and destination"},
        {"issue": "splinter_risk", "check": "unfinished edge or end grain", "severity": "high",
         "fix": "Specify edge banding, sanding grit (min 180), and sealant application"},
        {"issue": "joint_failure", "check": "joint type not specified for load", "severity": "medium",
         "fix": "Specify joinery: dowel, biscuit, mortise-tenon, or metal bracket with fastener spec"},
        {"issue": "finish_consistency", "check": "finish type and application method not specified", "severity": "medium",
         "fix": "Specify finish (oil/wax/lacquer), application method, and number of coats"},
        {"issue": "warping", "check": "large flat panel without grain direction specification", "severity": "medium",
         "fix": "Specify grain orientation, add cross-bracing or plywood for large panels"},
        {"issue": "fastener_corrosion", "check": "metal fasteners in outdoor/moist environment", "severity": "medium",
         "fix": "Specify stainless steel or coated fasteners for moisture-prone applications"},
    ],
}

_MATERNAL_COMPLIANCE: dict[str, list[dict]] = {
    "skin_contact_materials": [
        {"check": "skin contact material certification", "requirement": "Oeko-Tex Standard 100 or REACH compliant",
         "severity": "high"},
        {"check": "nickel release test for metal components", "requirement": "EN 1811 / REACH Annex XVII",
         "severity": "high"},
        {"check": "azo dye free", "requirement": "REACH Annex XVII, < 20ppm per amine",
         "severity": "medium"},
    ],
    "food_contact": [
        {"check": "food contact material declaration", "requirement": "FDA 21 CFR or EU 10/2011 compliant",
         "severity": "high"},
        {"check": "migration test report", "requirement": "Overall migration < 10mg/dm2, specific migration per substance",
         "severity": "high"},
        {"check": "volatile content for silicone", "requirement": "VOC < 0.5% for LSR, BFR/TBBPA free",
         "severity": "high"},
    ],
    "small_parts": [
        {"check": "small parts cylinder test", "requirement": "Component must not fit entirely in small parts cylinder (16.7mm Ø)",
         "severity": "high"},
        {"check": "pull force test for attached parts", "requirement": "> 70N pull force per ASTM F963 / EN 71-1",
         "severity": "high"},
        {"check": "battery compartment security", "requirement": "Screw-lock or 2-step opening required",
         "severity": "high"},
    ],
    "sharp_edges": [
        {"check": "edge radius specification", "requirement": "Minimum 0.5mm radius on all accessible edges",
         "severity": "high"},
        {"check": "sharp point test", "requirement": "ASTM F963 / EN 71-1 sharp point test required for < 36mo products",
         "severity": "medium"},
    ],
    "electrical_safety": [
        {"check": "UL/ETL/CE certification for AC products", "requirement": "UL 859 or EN 60335 series",
         "severity": "high"},
        {"check": "battery safety for rechargeable products", "requirement": "UN 38.3, IEC 62133 / UL 2054",
         "severity": "high"},
        {"check": "overheat protection", "requirement": "Auto shut-off at 80°C surface temp or thermal fuse",
         "severity": "high"},
    ],
    "flammability": [
        {"check": "textile flammability", "requirement": "16 CFR 1610 / EN 71-2 compliant",
         "severity": "high"},
        {"check": "plastic flammability rating", "requirement": "UL 94 V-2 minimum for enclosure, V-0 preferred",
         "severity": "medium"},
    ],
    "bpa_phthalate": [
        {"check": "BPA free declaration", "requirement": "BPA < 0.1ppm (baby products) or < 10ppm (general)",
         "severity": "high"},
        {"check": "phthalate free declaration", "requirement": "DINP/DIDP/DEHP/DNOP total < 0.1%, per CPSC / REACH",
         "severity": "high"},
    ],
    "labeling": [
        {"check": "product marking requirements", "requirement": "Country of origin, manufacturer info, date code, material symbols",
         "severity": "medium"},
        {"check": "warning labels", "requirement": "Age warning, choking hazard, electrical safety, care instructions",
         "severity": "medium"},
        {"check": "language requirements", "requirement": "Multi-language labeling for EU market per EU Directive 2001/95/EC",
         "severity": "medium"},
    ],
}

_MATERIAL_FACTORY_QUESTIONS: dict[str, list[str]] = {
    "injection_mold": [
        "What is the planned cavity count for the injection mold?",
        "What is the estimated cycle time per shot?",
        "What draft angles are planned for the core and cavity sides?",
        "Are there any undercuts requiring side-action mechanisms?",
        "What is the expected steel type for the mold? (e.g., P20, H13, S136)",
        "What surface finish / texture is specified? (e.g., VDI, SPI, MT)",
        "Where are the gate locations and what type of gate is planned?",
        "What is the ejector system design? (pins, sleeve, stripper)",
        "What cooling channel layout is planned?",
        "Is there a DME or HASCO standard preferred?",
    ],
    "silicone": [
        "What is the Shore hardness specification? (e.g., 30A, 50A, 70A)",
        "Is this liquid silicone rubber (LSR) or HCR (high consistency rubber)?",
        "What is the planned cure time and temperature?",
        "What is the expected flash allowance?",
        "Are there any self-lubricating or food-grade requirements?",
        "What color system will be used? (masterbatch or pre-colored)",
        "What post-cure process is required?",
    ],
    "textile": [
        "What is the fabric composition and weight (GSM)?",
        "What seam type and stitch density (SPI) is specified?",
        "Is there a pre-shrink or wash-down requirement?",
        "What is the color fastness standard for dyeing?",
        "Are there specific thread or zipper specifications?",
        "What is the tolerance per size in the grade rule?",
        "Is there a pattern matching requirement for printed fabrics?",
    ],
    "small_appliance": [
        "What PCB assembly standards are expected? (e.g., IPC-A-610 Class 2)",
        "What is the target IP rating for water/dust ingress?",
        "What certifications are needed for the target market?",
        "What battery type and safety certifications are required?",
        "What drop test height and standard applies?",
        "What is the target motor/actuator specification?",
    ],
    "wood": [
        "What wood species and grade is specified?",
        "What is the target moisture content range?",
        "What finish type and application method is planned?",
        "What joinery method is specified? (e.g., dovetail, dowel, biscuit)",
        "What is the sanding grit requirement?",
        "What adhesive type is required? (PVA, epoxy, PU)",
        "Are there any VOC limits on the finish?",
    ],
}


# ──────────────────────────────────────────────
# DFM Review
# ──────────────────────────────────────────────


def run_dfm_review(spec: dict, material_type: str) -> list[dict]:
    """
    Perform Design for Manufacturing review.

    Checks draft angles, wall thickness, undercuts, parting lines, and ejector
    pin placement appropriate for the specified material type.

    Args:
        spec: product specification dict with keys like 'dimensions', 'wall_thickness',
              'draft_angle', 'features', 'material'.
        material_type: one of 'injection_mold', 'silicone', 'textile',
                       'small_appliance', 'wood'.

    Returns:
        list of DFM finding dicts sorted by severity:
            - 'issue': str
            - 'check': str
            - 'severity': str (high/medium/low)
            - 'fix': str
            - 'status': str ('flagged' | 'passed' | 'insufficient_data')
            - 'spec_value': str (what the spec says or 'not specified')
    """
    rules = _DFM_RULES.get(material_type, [])
    if not rules:
        return [{
            "issue": f"unknown_material_{material_type}",
            "check": "No DFM rules defined for this material",
            "severity": "high",
            "fix": "Provide material type from: injection_mold, silicone, textile, small_appliance, wood",
            "status": "insufficient_data",
            "spec_value": material_type,
        }]

    spec_wall = spec.get("wall_thickness", spec.get("wall", 0))
    spec_draft = spec.get("draft_angle", spec.get("draft", 0))
    features = spec.get("features", [])

    results: list[dict] = []
    for rule in rules:
        spec_value = "not specified"
        status = "insufficient_data"

        if rule["issue"] == "draft_angle_insufficient" and spec_draft:
            spec_value = f"{spec_draft}°"
            if spec_draft >= 1:
                status = "passed"
            else:
                status = "flagged"

        elif rule["issue"] == "wall_thickness_variation" and isinstance(spec_wall, (int, float)):
            spec_value = f"{spec_wall}mm"
            status = "flagged"  # Can't verify variation from single value

        elif rule["issue"] == "sharp_inside_corner":
            corner_radius = spec.get("corner_radius", 0)
            spec_value = f"{corner_radius}mm" if corner_radius else "not specified"
            if corner_radius and spec_wall and corner_radius >= 0.5 * spec_wall:
                status = "passed"
            else:
                status = "flagged"

        elif rule["issue"] == "undercut_detected":
            has_undercut = spec.get("has_undercut", False)
            spec_value = str(has_undercut)
            if has_undercut:
                status = "flagged"
            else:
                status = "passed"

        elif rule["issue"] in ("sink_mark_risk",):
            status = "flagged"  # Requires detailed analysis
            spec_value = "general risk assessment needed"

        elif rule["issue"] in ("parting_line", "ejector_pin_mark"):
            cosmetic_surface = spec.get("cosmetic_surface", "")
            spec_value = cosmetic_surface or "not specified"
            status = "flagged" if not cosmetic_surface else "passed" if "visible" not in cosmetic_surface.lower() else "flagged"

        else:
            status = "flagged"  # Default flag for review

        results.append({
            "issue": rule["issue"],
            "check": rule["check"],
            "severity": rule["severity"],
            "fix": rule["fix"],
            "status": status,
            "spec_value": spec_value,
        })

    # Sort by severity: high first, then medium, then low
    severity_order = {"high": 0, "medium": 1, "low": 2}
    results.sort(key=lambda x: severity_order.get(x["severity"], 9))
    return results


# ──────────────────────────────────────────────
# Maternal Compliance Check
# ──────────────────────────────────────────────


def check_maternal_compliance(spec: dict, category: str) -> list[dict]:
    """
    Screen product spec against maternal/child safety compliance categories.

    Checks: skin contact materials, food contact, small parts, sharp edges,
    electrical safety, flammability, BPA/phthalate, labeling.

    Args:
        spec: product specification dict with keys like 'material', 'category_type',
              'has_battery', 'has_food_contact', 'age_range', 'target_market'.
        category: product category for narrowing checks (e.g., 'feeding', 'nursing',
                  'baby_carry', 'baby_monitor').

    Returns:
        list of compliance check dicts sorted by severity:
            - 'section': str (compliance category)
            - 'check': str
            - 'requirement': str
            - 'severity': str (high/medium)
            - 'status': str ('required' | 'not_applicable' | 'insufficient_data')
    """
    age_range = spec.get("age_range", "0-36mo")
    has_food_contact = spec.get("has_food_contact", False)
    has_battery = spec.get("has_battery", False)
    has_electronics = spec.get("has_electronics", False)
    target_market = spec.get("target_market", "US")

    # Determine which sections apply
    applicable_sections = ["skin_contact_materials", "labeling"]

    if "3" in age_range or "baby" in age_range.lower():
        applicable_sections.append("small_parts")
        applicable_sections.append("sharp_edges")

    if has_food_contact or "feeding" in category.lower():
        applicable_sections.append("food_contact")

    if has_food_contact or "feeding" in category.lower():
        applicable_sections.append("bpa_phthalate")

    if has_battery or has_electronics:
        applicable_sections.append("electrical_safety")

    if "textile" in spec.get("material", "").lower() or "cloth" in spec.get("material", "").lower():
        applicable_sections.append("flammability")

    results: list[dict] = []
    for section_name, checks in _MATERNAL_COMPLIANCE.items():
        if section_name not in applicable_sections:
            continue
        for check in checks:
            status = "required"
            results.append({
                "section": section_name,
                "check": check["check"],
                "requirement": check["requirement"],
                "severity": check["severity"],
                "status": status,
            })

    results.sort(key=lambda x: (0 if x["severity"] == "high" else 1))
    return results


# ──────────────────────────────────────────────
# Generate BOM Structure
# ──────────────────────────────────────────────


def generate_bom_structure(spec: dict) -> dict:
    """
    Create a Bill of Materials from a product specification.

    Produces a structured BOM with components, materials, quantities, supplier
    notes, estimated costs, and assembly sequence.

    Args:
        spec: product specification dict. Should include 'components' list, or
              'sections' / 'parts' dict describing product structure.

    Returns:
        dict with:
            - 'bom': list of BOM items
            - 'total_estimated_cost': float
            - 'assembly_sequence': list[str]
            - 'top_risk_components': list[str]
    """
    components = spec.get("components", spec.get("parts", spec.get("sections", [])))
    if isinstance(components, list):
        bom_items = []
        for comp in components:
            bom_items.append({
                "component_name": comp.get("name", comp.get("part_name", "unknown")),
                "material": comp.get("material", "TBD"),
                "quantity": comp.get("quantity", 1),
                "supplier_notes": comp.get("notes", comp.get("supplier_notes", "")),
                "estimated_cost": comp.get("estimated_cost", comp.get("cost", 0)),
                "assembly_step": comp.get("assembly_step", comp.get("step", 0)),
            })
    else:
        bom_items = []

    if not bom_items:
        # Generate placeholder BOM if no components specified
        bom_items = [
            {"component_name": "Main housing", "material": "TBD", "quantity": 1,
             "supplier_notes": "Material and tooling TBD", "estimated_cost": 0, "assembly_step": 1},
            {"component_name": "Accessories", "material": "TBD", "quantity": 1,
             "supplier_notes": "TBD per design review", "estimated_cost": 0, "assembly_step": 2},
        ]

    total_cost = sum(
        item.get("estimated_cost", 0) * item.get("quantity", 1)
        for item in bom_items
    )

    # Assembly sequence
    assembly_sequence = [
        item["component_name"] for item in sorted(
            bom_items, key=lambda x: x.get("assembly_step", 99)
        )
    ]

    # Risk components: those with no material or zero cost
    risk_components = [
        item["component_name"] for item in bom_items
        if item.get("material", "") in ("", "TBD") or item.get("estimated_cost", 0) == 0
    ]

    return {
        "bom": bom_items,
        "total_estimated_cost": round(total_cost, 2),
        "assembly_sequence": assembly_sequence,
        "top_risk_components": risk_components,
    }


# ──────────────────────────────────────────────
# Generate Factory QA Template
# ──────────────────────────────────────────────


def generate_factory_qa_template(spec: dict) -> list[str]:
    """
    Generate questions that a factory should answer before quoting.

    Adapts material-specific questions based on spec material type.

    Args:
        spec: product specification dict with at least 'material' key.

    Returns:
        list of QA question strings.
    """
    material = spec.get("material", "").lower()
    base_questions: list[str] = [
        "What is the estimated tooling cost and lead time?",
        "What is the unit price at MOQ 1000, 5000, and 10000?",
        "What ISO certifications does the factory hold?",
        "What is the typical first-article lead time?",
        "What QC inspection standards are used (AQL level)?",
        "What packaging options are available (retail vs bulk)?",
        "What shipping terms are offered (FOB/EXW/CIF)?",
        "What is the warranty policy for manufacturing defects?",
    ]

    material_questions = _MATERIAL_FACTORY_QUESTIONS.get(material, [])
    all_questions = base_questions + material_questions

    # Add category-specific questions
    category = spec.get("category_type", "").lower()
    if "baby" in category or "infant" in category:
        all_questions.append("Do you have experience with maternal/infant product certification?")
        all_questions.append("What child safety testing facilities are available in-house?")
    if "electronic" in category or spec.get("has_electronics"):
        all_questions.append("Are PCB assembly and testing done in-house or outsourced?")
        all_questions.append("What ESD protection measures are in place?")

    return all_questions


# ──────────────────────────────────────────────
# Generate Full Tech Pack
# ──────────────────────────────────────────────


def generate_tech_pack(spec: dict, config: dict | None = None) -> dict:
    """
    Full tech pack generation pipeline.

    Pipeline:
        1. DFM review
        2. Maternal compliance check
        3. BOM generation
        4. Factory QA template

    Args:
        spec: product specification dict with material, dimensions, features.
        config: optional dict with:
            - 'material_type': str (default from spec.material)
            - 'category': str (maternal product category)
            - 'include_dfm': bool (default True)
            - 'include_compliance': bool (default True)

    Returns:
        dict with complete tech pack output.
    """
    config = config or {}
    material_type = config.get("material_type", spec.get("material", "injection_mold"))
    category = config.get("category", spec.get("category_type", "general"))
    include_dfm = config.get("include_dfm", True)
    include_compliance = config.get("include_compliance", True)

    # Step 1: DFM
    dfm_findings = run_dfm_review(spec, material_type) if include_dfm else []

    # Step 2: Compliance
    compliance = check_maternal_compliance(spec, category) if include_compliance else []

    # Step 3: BOM
    bom = generate_bom_structure(spec)

    # Step 4: QA template
    qa = generate_factory_qa_template(spec)

    # Manufacturing risk summary
    high_risk = [f for f in dfm_findings if f.get("status") == "flagged" and f.get("severity") == "high"]
    failure_assembly = [f for f in dfm_findings if "undercut" in f.get("issue", "")
                        or "parting" in f.get("issue", "") or "ejector" in f.get("issue", "")]
    priority_prototype = [f["issue"] for f in dfm_findings if f.get("severity") == "high"][:3]
    priority_compliance = [c["check"] for c in compliance if c.get("severity") == "high"][:3]

    manufacturing_risk_summary = {
        "most_likely_manufacturing_risk": [
            f"{f.get('issue', '?')}: {f.get('fix', '')}"
            for f in high_risk[:3]
        ],
        "most_error_prone_assembly": [
            f"{f.get('issue', '?')}"
            for f in failure_assembly[:3]
        ],
        "priority_prototype_validation": priority_prototype,
        "priority_compliance_confirmation": priority_compliance,
    }

    return {
        "product": {
            "name": spec.get("name", spec.get("product_name", "Unnamed Product")),
            "material": material_type,
            "category": category,
        },
        "drawings_spec": {
            "dimensions": spec.get("dimensions", {}),
            "weight": spec.get("weight"),
            "key_features": spec.get("features", []),
        },
        "dfm_findings": dfm_findings,
        "compliance_checklist": compliance,
        "bom": bom,
        "qa_template": qa,
        "manufacturing_risk_summary": manufacturing_risk_summary,
        "config_used": {
            "material_type": material_type,
            "category": category,
        },
    }
