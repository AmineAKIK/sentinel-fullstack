#!/usr/bin/env python3
"""Reconstruit le dossier DWWM Sentinel a partir du DOCX source.

Le script travaille directement sur l'OOXML afin de conserver la mise en page,
les styles, les en-tetes, les pieds de page et les images du document d'origine.
Il produit toujours un nouveau fichier et ne modifie jamais le DOCX source.
"""

from __future__ import annotations

import argparse
import copy
import datetime as dt
import re
import struct
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET


W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
R_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
WP_NS = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
A_NS = "http://schemas.openxmlformats.org/drawingml/2006/main"
PIC_NS = "http://schemas.openxmlformats.org/drawingml/2006/picture"
CP_NS = "http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
DC_NS = "http://purl.org/dc/elements/1.1/"
DCTERMS_NS = "http://purl.org/dc/terms/"
XSI_NS = "http://www.w3.org/2001/XMLSchema-instance"
EP_NS = "http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"

NS = {
    "w": W_NS,
    "r": R_NS,
    "rel": REL_NS,
    "wp": WP_NS,
    "a": A_NS,
    "pic": PIC_NS,
}

for prefix, uri in {
    "w": W_NS,
    "r": R_NS,
    "wp": WP_NS,
    "a": A_NS,
    "pic": PIC_NS,
    "cp": CP_NS,
    "dc": DC_NS,
    "dcterms": DCTERMS_NS,
    "xsi": XSI_NS,
    "ep": EP_NS,
}.items():
    ET.register_namespace(prefix, uri)


def qn(prefix: str, name: str) -> str:
    return f"{{{NS[prefix]}}}{name}"


def normalize_search_text(text: str) -> str:
    text = " ".join(text.split())
    text = re.sub(r"\s*([’'])\s*", r"\1", text)
    text = text.replace("’", "'")
    text = re.sub(r"\s+([,.;:!?])", r"\1", text)
    text = re.sub(r"([(/])\s+", r"\1", text)
    text = re.sub(r"\s+([/)])", r"\1", text)
    return text.strip()


def element_text(element: ET.Element) -> str:
    text = " ".join((node.text or "") for node in element.iter(qn("w", "t")))
    return normalize_search_text(text)


def paragraph_text(paragraph: ET.Element) -> str:
    return "".join(node.text or "" for node in paragraph.iter(qn("w", "t"))).strip()


def first_paragraph(element: ET.Element) -> ET.Element:
    if element.tag == qn("w", "p"):
        return element
    paragraph = element.find(".//w:p", NS)
    if paragraph is None:
        paragraph = ET.SubElement(element, qn("w", "p"))
    return paragraph


def clear_paragraph_content(paragraph: ET.Element) -> None:
    for child in list(paragraph):
        if child.tag != qn("w", "pPr"):
            paragraph.remove(child)


def add_text_run(
    paragraph: ET.Element,
    text: str,
    *,
    bold: bool = False,
    italic: bool = False,
    color: str | None = None,
    size_half_points: int | None = None,
    font: str | None = None,
) -> ET.Element:
    run = ET.SubElement(paragraph, qn("w", "r"))
    if bold or italic or color or size_half_points or font:
        run_props = ET.SubElement(run, qn("w", "rPr"))
        if bold:
            ET.SubElement(run_props, qn("w", "b"))
        if italic:
            ET.SubElement(run_props, qn("w", "i"))
        if color:
            ET.SubElement(run_props, qn("w", "color"), {qn("w", "val"): color})
        if size_half_points:
            ET.SubElement(run_props, qn("w", "sz"), {qn("w", "val"): str(size_half_points)})
            ET.SubElement(run_props, qn("w", "szCs"), {qn("w", "val"): str(size_half_points)})
        if font:
            ET.SubElement(
                run_props,
                qn("w", "rFonts"),
                {
                    qn("w", "ascii"): font,
                    qn("w", "hAnsi"): font,
                    qn("w", "cs"): font,
                },
            )
    text_node = ET.SubElement(run, qn("w", "t"))
    if text.startswith(" ") or text.endswith(" ") or "  " in text:
        text_node.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
    text_node.text = text
    return run


def set_paragraph_text(
    paragraph: ET.Element,
    text: str,
    *,
    bold: bool = False,
    italic: bool = False,
    color: str | None = None,
    size_half_points: int | None = None,
    font: str | None = None,
) -> None:
    clear_paragraph_content(paragraph)
    add_text_run(
        paragraph,
        text,
        bold=bold,
        italic=italic,
        color=color,
        size_half_points=size_half_points,
        font=font,
    )


def set_cell_text(
    cell: ET.Element,
    text: str,
    *,
    bold: bool = False,
    color: str | None = None,
    font: str | None = None,
    size_half_points: int | None = None,
) -> None:
    paragraphs = cell.findall("w:p", NS)
    if not paragraphs:
        paragraphs = [ET.SubElement(cell, qn("w", "p"))]
    set_paragraph_text(
        paragraphs[0],
        text,
        bold=bold,
        color=color,
        font=font,
        size_half_points=size_half_points,
    )
    for paragraph in paragraphs[1:]:
        cell.remove(paragraph)


def set_cell_paragraphs(cell: ET.Element, texts: list[str]) -> None:
    paragraphs = cell.findall("w:p", NS)
    while len(paragraphs) < len(texts):
        paragraphs.append(ET.SubElement(cell, qn("w", "p")))
    for paragraph, text in zip(paragraphs, texts):
        set_paragraph_text(paragraph, text)
    for paragraph in paragraphs[len(texts) :]:
        cell.remove(paragraph)


def paragraph_style(paragraph: ET.Element, style_id: str) -> None:
    props = paragraph.find("w:pPr", NS)
    if props is None:
        props = ET.Element(qn("w", "pPr"))
        paragraph.insert(0, props)
    style = props.find("w:pStyle", NS)
    if style is None:
        style = ET.SubElement(props, qn("w", "pStyle"))
    style.set(qn("w", "val"), style_id)


def make_paragraph(
    text: str,
    *,
    style: str = "Normal",
    bold: bool = False,
    italic: bool = False,
    color: str | None = None,
    size_half_points: int | None = None,
    font: str | None = None,
    page_break_before: bool = False,
) -> ET.Element:
    paragraph = ET.Element(qn("w", "p"))
    props = ET.SubElement(paragraph, qn("w", "pPr"))
    ET.SubElement(props, qn("w", "pStyle"), {qn("w", "val"): style})
    if page_break_before:
        ET.SubElement(props, qn("w", "pageBreakBefore"))
    add_text_run(
        paragraph,
        text,
        bold=bold,
        italic=italic,
        color=color,
        size_half_points=size_half_points,
        font=font,
    )
    return paragraph


def make_caption(text: str) -> ET.Element:
    return make_paragraph(text, style="Lgende", italic=True, color="40546A", size_half_points=18)


def make_table(rows: list[list[str]], *, header: bool = True, code: bool = False) -> ET.Element:
    table = ET.Element(qn("w", "tbl"))
    table_props = ET.SubElement(table, qn("w", "tblPr"))
    ET.SubElement(table_props, qn("w", "tblW"), {qn("w", "w"): "0", qn("w", "type"): "auto"})
    borders = ET.SubElement(table_props, qn("w", "tblBorders"))
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        ET.SubElement(
            borders,
            qn("w", edge),
            {qn("w", "val"): "single", qn("w", "sz"): "4", qn("w", "color"): "D8E3EE"},
        )
    for row_index, row_values in enumerate(rows):
        row = ET.SubElement(table, qn("w", "tr"))
        for value in row_values:
            cell = ET.SubElement(row, qn("w", "tc"))
            cell_props = ET.SubElement(cell, qn("w", "tcPr"))
            ET.SubElement(cell_props, qn("w", "tcW"), {qn("w", "w"): "0", qn("w", "type"): "auto"})
            if header and row_index == 0:
                ET.SubElement(cell_props, qn("w", "shd"), {qn("w", "fill"): "17365D"})
            paragraph = ET.SubElement(cell, qn("w", "p"))
            add_text_run(
                paragraph,
                value,
                bold=header and row_index == 0,
                color="FFFFFF" if header and row_index == 0 else "0B1220",
                font="Consolas" if code else None,
                size_half_points=16 if code else 18,
            )
    return table


def make_code_table(code: str) -> ET.Element:
    table = make_table([[code]], header=False, code=True)
    props = table.find("w:tblPr", NS)
    if props is not None:
        shading = ET.SubElement(props, qn("w", "shd"), {qn("w", "fill"): "F4F7FA"})
        shading.tail = None
    return table


def find_body_element(body: ET.Element, needle: str, *, exact: bool = False) -> ET.Element:
    needle = normalize_search_text(needle)
    for element in list(body):
        text = element_text(element)
        if (exact and text == needle) or (not exact and needle in text):
            return element
    raise ValueError(f"Element introuvable: {needle}")


def find_body_elements(body: ET.Element, needle: str) -> list[ET.Element]:
    needle = normalize_search_text(needle)
    return [element for element in list(body) if needle in element_text(element)]


def replace_paragraph(body: ET.Element, needle: str, replacement: str, *, exact: bool = False) -> ET.Element:
    element = find_body_element(body, needle, exact=exact)
    set_paragraph_text(first_paragraph(element), replacement)
    return element


def insert_before(body: ET.Element, reference: ET.Element, nodes: list[ET.Element]) -> None:
    index = list(body).index(reference)
    for offset, node in enumerate(nodes):
        body.insert(index + offset, node)


def insert_after(body: ET.Element, reference: ET.Element, nodes: list[ET.Element]) -> None:
    index = list(body).index(reference) + 1
    for offset, node in enumerate(nodes):
        body.insert(index + offset, node)


def add_bookmark(paragraph: ET.Element, bookmark_id: int, name: str) -> None:
    start = ET.Element(
        qn("w", "bookmarkStart"),
        {qn("w", "id"): str(bookmark_id), qn("w", "name"): name},
    )
    end = ET.Element(qn("w", "bookmarkEnd"), {qn("w", "id"): str(bookmark_id)})
    insert_at = 1 if paragraph.find("w:pPr", NS) is not None else 0
    paragraph.insert(insert_at, start)
    paragraph.append(end)


def set_toc_line(paragraph: ET.Element, label: str, bookmark: str, cached_page: str) -> None:
    clear_paragraph_content(paragraph)
    add_text_run(paragraph, label)
    add_text_run(paragraph, "  ···  ", color="7A8899")
    begin = ET.SubElement(paragraph, qn("w", "r"))
    ET.SubElement(begin, qn("w", "fldChar"), {qn("w", "fldCharType"): "begin"})
    instruction_run = ET.SubElement(paragraph, qn("w", "r"))
    instruction = ET.SubElement(instruction_run, qn("w", "instrText"))
    instruction.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
    instruction.text = f" PAGEREF {bookmark} \\h "
    separate = ET.SubElement(paragraph, qn("w", "r"))
    ET.SubElement(separate, qn("w", "fldChar"), {qn("w", "fldCharType"): "separate"})
    add_text_run(paragraph, cached_page)
    end = ET.SubElement(paragraph, qn("w", "r"))
    ET.SubElement(end, qn("w", "fldChar"), {qn("w", "fldCharType"): "end"})


def image_target(element: ET.Element, rel_targets: dict[str, str]) -> str | None:
    blip = element.find(".//a:blip", NS)
    if blip is None:
        return None
    relationship_id = blip.get(qn("r", "embed"))
    return rel_targets.get(relationship_id or "")


def image_elements(body: ET.Element, target: str, rel_targets: dict[str, str]) -> list[ET.Element]:
    return [element for element in list(body) if image_target(element, rel_targets) == target]


def png_dimensions(data: bytes) -> tuple[int, int]:
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("L'asset n'est pas un PNG")
    return struct.unpack(">II", data[16:24])


def add_image_relationship(
    relationships: ET.Element,
    rel_targets: dict[str, str],
    media_name: str,
) -> str:
    ids = []
    for rel in relationships:
        match = re.fullmatch(r"rId(\d+)", rel.get("Id", ""))
        if match:
            ids.append(int(match.group(1)))
    relationship_id = f"rId{max(ids, default=0) + 1}"
    target = f"media/{media_name}"
    ET.SubElement(
        relationships,
        f"{{{REL_NS}}}Relationship",
        {
            "Id": relationship_id,
            "Type": "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image",
            "Target": target,
        },
    )
    rel_targets[relationship_id] = target
    return relationship_id


def clone_image_paragraph(
    template: ET.Element,
    relationship_id: str,
    *,
    width_px: int,
    height_px: int,
    doc_property_id: int,
    description: str,
) -> ET.Element:
    paragraph = copy.deepcopy(template)
    blip = paragraph.find(".//a:blip", NS)
    if blip is None:
        raise ValueError("Le paragraphe modele ne contient pas d'image")
    blip.set(qn("r", "embed"), relationship_id)
    width_emu = int(6.55 * 914400)
    height_emu = int(width_emu * height_px / width_px)
    for extent in paragraph.findall(".//wp:extent", NS) + paragraph.findall(".//a:ext", NS):
        extent.set("cx", str(width_emu))
        extent.set("cy", str(height_emu))
    for doc_pr in paragraph.findall(".//wp:docPr", NS):
        doc_pr.set("id", str(doc_property_id))
        doc_pr.set("name", f"Figure {doc_property_id}")
        doc_pr.set("descr", description)
        doc_pr.set("title", description)
    return paragraph


def update_alt_text(body: ET.Element, rel_targets: dict[str, str], captions: dict[str, str]) -> None:
    next_id = 1
    for element in list(body):
        target = image_target(element, rel_targets)
        if not target:
            continue
        description = captions.get(target, Path(target).stem)
        for doc_pr in element.findall(".//wp:docPr", NS):
            doc_pr.set("id", str(next_id))
            doc_pr.set("name", f"Figure {next_id}")
            doc_pr.set("descr", description)
            doc_pr.set("title", description)
            next_id += 1


def add_captions_after_images(
    body: ET.Element,
    rel_targets: dict[str, str],
    captions: dict[str, str],
    source_label: str,
) -> None:
    index = 0
    figure_number = 1
    while index < len(body):
        element = body[index]
        target = image_target(element, rel_targets)
        if target:
            caption = captions.get(target, f"Illustration Sentinel ({Path(target).name})")
            next_element = body[index + 1] if index + 1 < len(body) else None
            if next_element is None or next_element.tag != qn("w", "p") or not paragraph_text(next_element).startswith("Figure "):
                body.insert(
                    index + 1,
                    make_caption(
                        f"Figure {figure_number} — {caption} — source : réalisation personnelle, Sentinel, {source_label}."
                    ),
                )
                index += 1
            figure_number += 1
        index += 1


def replace_media_from_assets(files: dict[str, bytes], assets_dir: Path, replacements: dict[str, str]) -> None:
    for media_target, asset_name in replacements.items():
        asset_path = assets_dir / asset_name
        if asset_path.exists():
            files[f"word/{media_target}"] = asset_path.read_bytes()


def update_core_properties(files: dict[str, bytes]) -> None:
    root = ET.fromstring(files["docProps/core.xml"])

    def set_value(namespace: str, name: str, value: str) -> None:
        element = root.find(f"{{{namespace}}}{name}")
        if element is None:
            element = ET.SubElement(root, f"{{{namespace}}}{name}")
        element.text = value

    set_value(DC_NS, "creator", "AKIK Mohamed Amine")
    set_value(DC_NS, "title", "Dossier de projet DWWM — Sentinel")
    set_value(DC_NS, "subject", "Application web de traçabilité et de pilotage des incidents industriels")
    set_value(CP_NS, "keywords", "DWWM, Sentinel, React, TypeScript, Express, PostgreSQL, sécurité, RGPD")
    set_value(CP_NS, "lastModifiedBy", "AKIK Mohamed Amine")
    modified = root.find(f"{{{DCTERMS_NS}}}modified")
    if modified is None:
        modified = ET.SubElement(root, f"{{{DCTERMS_NS}}}modified")
    modified.set(f"{{{XSI_NS}}}type", "dcterms:W3CDTF")
    modified.text = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    files["docProps/core.xml"] = ET.tostring(root, encoding="utf-8", xml_declaration=True)


def ensure_fields_update(files: dict[str, bytes]) -> None:
    root = ET.fromstring(files["word/settings.xml"])
    update = root.find("w:updateFields", NS)
    if update is None:
        update = ET.SubElement(root, qn("w", "updateFields"))
    update.set(qn("w", "val"), "true")
    files["word/settings.xml"] = ET.tostring(root, encoding="utf-8", xml_declaration=True)


def rebuild(args: argparse.Namespace) -> None:
    source = Path(args.source).resolve()
    output = Path(args.output).resolve()
    assets_dir = Path(args.assets_dir).resolve()

    with zipfile.ZipFile(source) as archive:
        files = {name: archive.read(name) for name in archive.namelist()}

    document = ET.fromstring(files["word/document.xml"])
    relationships = ET.fromstring(files["word/_rels/document.xml.rels"])
    rel_targets = {rel.get("Id", ""): rel.get("Target", "") for rel in relationships}
    body = document.find("w:body", NS)
    if body is None:
        raise ValueError("Corps du document introuvable")

    backend_total = args.backend_unit + args.backend_integration
    total_tests = backend_total + args.frontend

    # Couverture et proprietes finales.
    cover_table = find_body_element(body, "562 tests")
    cover_cells = cover_table.findall(".//w:tc", NS)
    set_cell_paragraphs(cover_cells[0], ["12", "tables physiques", "11 applicatives · 1 technique · 38 migrations"])
    set_cell_paragraphs(
        cover_cells[1],
        [str(total_tests), "tests automatisés", f"{backend_total} backend · {args.frontend} frontend"],
    )
    set_cell_paragraphs(cover_cells[2], ["4", "jobs CI", "lint · build · tests · images Docker"])
    replace_paragraph(body, "DATE DE DÉPÔT", f"DATE DE DÉPÔT    {args.deposit_date}")
    replace_paragraph(
        body,
        "APPLICATION EN PRODUCTION",
        "INSTANCE PUBLIQUE DE DÉMONSTRATION    sentinel.akiksystems.fr",
    )

    # Sommaire a champs de page Word, mis a jour automatiquement.
    unfinished_toc = find_body_element(body, "La pagination définitive sera à reporter")
    body.remove(unfinished_toc)
    chapter_titles = {
        1: "Liste des compétences du référentiel couvertes par le projet",
        2: "Contexte et expression du besoin",
        3: "Gestion de projet",
        4: "Environnement technique",
        5: "Réalisations — Maquettes et enchaînement des interfaces",
        6: "Conception de la base de données",
        7: "Diagrammes UML",
        8: "Réalisations front-end",
        9: "Réalisations back-end",
        10: "Sécurité de l'application",
        11: "RGPD",
        12: "Jeu d'essai",
        13: "Tests",
        14: "Déploiement",
        15: "Bilan",
        16: "Annexes",
    }
    cached_pages = {
        1: "4", 2: "6", 3: "11", 4: "14", 5: "19", 6: "32", 7: "38", 8: "44",
        9: "49", 10: "53", 11: "56", 12: "58", 13: "61", 14: "63", 15: "65", 16: "68",
    }
    toc_lines = [element for element in list(body) if re.match(r"^\d+\.\s", element_text(element))]
    for number, toc_line in enumerate(toc_lines[:16], start=1):
        set_toc_line(toc_line, f"{number}.  {chapter_titles[number]}", f"chapitre_{number}", cached_pages[number])
    for number in range(1, 17):
        title_element = find_body_element(body, chapter_titles[number], exact=True)
        add_bookmark(first_paragraph(title_element), 100 + number, f"chapitre_{number}")

    # Matrice des huit competences du titre.
    competency_table = find_body_element(body, "Compétence Où elle est démontrée")
    competency_rows = [
        ["Compétence", "Preuves dans le dossier", "Repère"],
        ["CCP1 — Installer et configurer son environnement de travail", "Architecture, outillage, Docker Compose et CI", "§4 et §14"],
        ["CCP1 — Maquetter des interfaces web ou web mobile", "Design system, maquettes desktop/mobile et flux", "§5"],
        ["CCP1 — Réaliser des interfaces statiques", "Composants React, HTML sémantique et tokens CSS", "§8.1"],
        ["CCP1 — Développer la partie dynamique", "Hooks, appels API, permissions et concurrence réseau", "§8.2"],
        ["CCP2 — Mettre en place une base relationnelle", "MCD, MPD, contraintes et 38 migrations", "§6"],
        ["CCP2 — Développer l'accès aux données SQL et NoSQL", "Repositories, SQL paramétré et deux usages JSONB", "§9.3"],
        ["CCP2 — Développer des composants métier côté serveur", "Politique de permissions, services et transactions", "§9.1–9.2"],
        ["CCP2 — Documenter le déploiement", "Topologies, configuration, migrations et procédure VPS", "§14"],
    ]
    replacement_competency_table = make_table(competency_rows)
    competency_index = list(body).index(competency_table)
    body.remove(competency_table)
    body.insert(competency_index, replacement_competency_table)

    # Contexte et perimetre : aucune promesse absolue ni faux temps reel.
    replace_paragraph(
        body,
        "Ce concept a depuis suscité l'intérêt de la R&D",
        "Après mon départ de l'entreprise, un échange informel avec la R&D du site a montré un intérêt pour le concept. Cet échange ne constitue ni une commande, ni une validation officielle, ni la preuve d'un déploiement industriel.",
    )
    replace_paragraph(
        body,
        "Ce qu'il garantit : un cadre où une anomalie",
        "Ce que Sentinel apporte : un cadre partagé qui réduit le risque qu'une anomalie déclarée reste invisible, non suivie ou non capitalisée. La qualité du suivi dépend néanmoins de la déclaration humaine et des règles d'usage définies par l'organisation.",
    )
    replace_paragraph(
        body,
        "Cette reconstruction a marqué le passage d’un prototype informatif",
        "Après cette phase exploratoire, le choix a été fait de reconstruire Sentinel sur des bases plus solides, dans un nouveau dépôt. Cette reconstruction a marqué le passage d’un prototype informatif à une application métier complète : modélisation relationnelle, gestion des rôles, permissions, workflow d’incident, historique, base de connaissance, tests automatisés, intégration continue, sécurité applicative et déploiement d’une instance publique de démonstration.",
    )
    fermi_summary = find_body_element(body, "Sur ce périmètre volontairement objectivable")
    insert_after(
        body,
        fermi_summary,
        [
            make_paragraph(
                "Décomposition de l’estimation de Fermi. Les valeurs ci-dessous sont des hypothèses de cadrage anonymisées, et non des mesures produites par Sentinel.",
                style="Titre3",
            ),
            make_table(
                [
                    ["Étape", "Calcul ou hypothèse", "Ordre de grandeur"],
                    ["Capacité disponible", "44 machines × 168 h × 90 % de disponibilité", "environ 6 650 h-machine/semaine"],
                    ["Charge estimée", "22 000 cartes × 2 passages × 7,5 min", "5 500 h-machine, soit environ 83 % d’utilisation"],
                    ["Stock simultané", "37 signalements/semaine × 3,5 jours ÷ 7, puis prise en compte des cas longs", "18–19 têtes ; fourchette retenue de 20–25"],
                    ["Perte par tête", "Hypothèse de 5 à 10 % de la capacité de sa machine selon la redondance", "borne de sensibilité, à confirmer par la mesure"],
                    ["Impact estimé", "Combinaison prudente des hypothèses précédentes", "200–290 h-machine ; 800–1 150 cartes ; 3,5–5 % par semaine"],
                    ["Gain potentiel", "Réduction du délai moyen de 3–4 jours à 1 jour", "environ 70 % de cette perte, soit 550–800 cartes/semaine"],
                ]
            ),
            make_paragraph(
                "Limites : l’estimation exclut les défauts tolérés, les interventions non tracées et les pertes AOI induites. Elle sert à justifier un besoin de mesure et ne doit pas être présentée comme un gain constaté ni comme un engagement industriel.",
                italic=True,
            ),
        ],
    )
    for text_node in document.iter(qn("w", "t")):
        if text_node.text:
            text_node.text = text_node.text.replace(
                "Tableau de bord partagé, actualisé en temps réel",
                "Tableau de bord partagé, actualisé automatiquement",
            ).replace("Historique structuré et exportable", "Historique structuré et filtrable")

    # Gestion de projet : jalons, risques et formulation proportionnee.
    replace_paragraph(
        body,
        "Le projet a été mené en solo, sur des itérations courtes",
        "Le projet a été mené seul, par itérations courtes. Les changements significatifs ont été découpés en commits ciblés et soumis aux contrôles disponibles (lint, compilation et tests). Cette discipline réduit les mélanges d'intentions sans prétendre que chaque commit historique est parfait ou intégralement couvert.",
    )
    tools_heading = find_body_element(body, "3.3 — Outils", exact=True)
    planning_nodes = [
        make_paragraph("3.3 — Jalons et risques", style="Titre2"),
        make_table(
            [
                ["Période", "Jalon", "Résultat vérifiable"],
                ["Octobre 2023", "Prototype exploratoire", "Validation du besoin de visibilité partagée"],
                ["2024–2025", "Montée en compétence et recadrage", "Choix d'une reconstruction plutôt qu'une extension du prototype"],
                ["Début 2026", "Reconstruction full-stack", "React, Express, PostgreSQL, rôles et workflow incident"],
                ["Juin 2026", "Durcissement de publication", "Sécurité, documentation, Docker et CI"],
                ["Juillet 2026", "Audits finaux", "UX, concurrence réseau, transactions, RGPD et dossier DWWM"],
            ]
        ),
        make_paragraph("Principaux risques et réponses", style="Titre3"),
        make_table(
            [
                ["Risque", "Impact", "Réponse mise en œuvre"],
                ["Dérive du périmètre", "Retard et complexité", "MVP explicite ; absence de pilotage machine et d'intégration ERP/GMAO"],
                ["Règles métier divergentes", "Action interdite ou incohérente", "Matrice de permissions serveur et tests par rôle"],
                ["Concurrence entre utilisateurs", "État perdu ou audit incomplet", "Transactions et verrouillage SELECT … FOR UPDATE"],
                ["Fuite de secrets ou mauvaise configuration", "Compromission de l'instance", "Variables d'environnement, validation au démarrage et CI"],
                ["Documentation obsolète", "Démonstration non crédible", "Audit croisé code, migrations, schémas et dossier avant dépôt"],
            ]
        ),
    ]
    insert_before(body, tools_heading, planning_nodes)
    set_paragraph_text(first_paragraph(tools_heading), "3.4 — Outils")
    environment_heading = find_body_element(body, "3.4 — Environnement humain", exact=True)
    set_paragraph_text(first_paragraph(environment_heading), "3.5 — Environnement humain")

    # Architecture et topologies reelles.
    replace_paragraph(
        body,
        "Sentinel est une application full-stack organisée en monorepo",
        "Sentinel est organisé dans un dépôt unique contenant deux applications Node.js indépendantes, backend/ et frontend/, chacune avec son propre package.json et son propre lockfile. Docker Compose orchestre les services nécessaires à l'exécution.",
    )
    architecture_replacements = {
        "—  Conteneurisation de la distribution autonome": "— Distribution autonome : Docker Compose orchestre PostgreSQL, le backend, le frontend servi par Nginx et Caddy. Dans cette variante, Caddy constitue le point d'entrée HTTPS de l'application.",
        "—  Instance publique de démonstration": "— Instance publique de démonstration : le VPS exécute trois conteneurs — PostgreSQL, backend et frontend. Un Nginx installé sur l'hôte assure HTTPS et relaie les requêtes vers les ports liés uniquement à 127.0.0.1 ; Caddy est désactivé sur cette instance.",
        "—  Reverse proxy et exposition réseau": "— Exposition réseau : la topologie dépend du mode de déploiement. Caddy est le proxy de la distribution autonome ; Nginx hôte remplit ce rôle sur l'instance publique. PostgreSQL n'est jamais exposé publiquement.",
        "—  Front-end  en production": "— Frontend : Vite réalise le build statique ; Nginx sert les fichiers compilés et redirige les routes de la SPA vers index.html.",
        "—  Environnement de production": "— Hébergement : sentinel.akiksystems.fr est une instance publique de démonstration sur VPS Linux. Elle prouve le déploiement technique mais ne constitue pas un déploiement dans une usine ni une validation par l'entreprise observée.",
        "—  Base de données": "— Base de données : PostgreSQL 15 utilise un volume persistant. Les migrations sont appliquées au démarrage. Le dépôt fournit des scripts pg_dump et de restauration ; l'activation d'une planification, la copie hors serveur et les essais périodiques de restauration doivent être vérifiés dans chaque environnement exploité.",
        "—  CI/CD": "— Intégration continue : GitHub Actions exécute cinq jobs — qualité backend, qualité frontend, intégration PostgreSQL, parcours navigateur Playwright et contrat des conteneurs. Aucun déploiement automatique n'est configuré : la livraison sur le VPS reste manuelle et documentée.",
    }
    for needle, replacement in architecture_replacements.items():
        replace_paragraph(body, needle, replacement)

    # Maquettage : formulation exacte, deplacement des planches completes en annexe.
    replace_paragraph(
        body,
        "Une première version fonctionnelle de Sentinel existait lorsque le livrable de maquettage",
        "Une première version fonctionnelle existait lorsque le livrable de maquettage a été formalisé. La démarche présentée est donc une consolidation de conception : inventaire de l'interface réelle, import de certaines vues dans Figma comme base éditable, création d'un design system, annotation des décisions et production de variantes responsive. Les maquettes ne sont pas présentées comme antérieures à tout code ; elles rendent explicites et vérifiables les choix qui ont guidé la stabilisation du produit.",
    )
    placeholder_flow = find_body_element(body, "À COMPLÉTER Dessiner")
    body.remove(placeholder_flow)
    replace_paragraph(
        body,
        "/login → clic bloc Board",
        "/login → clic sur le bloc Board → /board → saisie du code Board → création d'une session Board en cookie HttpOnly → affichage grand écran en lecture seule. La route d'interface est publique, mais l'API de données exige une session Board ou Workshop valide.",
    )
    replace_paragraph(
        body,
        "/login → clic bloc Administration",
        "/login → bloc Administration → /admin/login → authentification → /admin/accueil → /admin/users → /admin/users/:id → /admin/lines → /admin/audit → /admin/support → /admin/parametres. Toutes ces routes sont protégées par AdminRoute ; la déconnexion retourne au portail.",
    )
    replace_paragraph(
        body,
        "/login → clic bloc Workshop",
        "/login → bloc Workshop → /workshop/login → premier accès par badge + code temporaire ou connexion standard par badge + mot de passe → /workshop/dashboard → Pilotage, Historique, Connaissance et Assistance. Journal ajoute une garde de rôle RESPONSABLE à la garde WorkshopRoute commune.",
    )

    # Base de donnees : chiffres et limites exacts.
    replace_paragraph(
        body,
        "Modéliser ceci en tables relationnelles strictes exigerait",
        "La séquence de machines est principalement lue et réécrite comme un agrégat JSONB validé par Zod. Ce choix simplifie l'édition atomique d'une configuration hétérogène — machine simple ou double robot — tout en restant localisé. Des requêtes SQL contrôlées utilisent néanmoins jsonb_array_elements et jsonb_array_length pour détecter des conflits ou produire des indicateurs. Une normalisation plus fine resterait possible si les besoins de requêtes par sous-équipement devenaient dominants.",
    )
    replace_paragraph(
        body,
        "Dans les deux cas, JSONB reste un choix local",
        "Dans les deux cas, JSONB reste un choix local et documenté au sein d'un schéma relationnel : clés étrangères, contraintes CHECK et index imposent les invariants structurants. Le MPD comporte 11 tables applicatives et la table technique schema_migrations.",
    )
    replace_paragraph(body, "Onze tables au total.", "Onze tables applicatives, auxquelles s'ajoute schema_migrations : douze tables physiques et 125 colonnes au total.")
    replace_paragraph(
        body,
        "workshop _incident_events  (audit trail immuable)",
        "workshop_incident_events — journal append-only par convention applicative : une ligne est ajoutée pour chaque action significative, avec un snapshot professionnel de l'acteur. L'application ne propose pas de modification de ces événements, mais l'immuabilité n'est pas imposée par un trigger ou des privilèges PostgreSQL et certaines suppressions techniques utilisent une cascade.",
    )

    # UML : aucune affirmation de synchronisation non verifiee.
    replace_paragraph(
        body,
        "Trois diagrammes couvrent le cœur métier. Code Mermaid prêt à exporter",
        "Trois diagrammes couvrent le cœur métier. Ils ont été vérifiés contre les routes, la politique de permissions et les migrations du commit audité. Les sources Mermaid du dépôt sont maintenues avec ces représentations.",
    )
    replace_paragraph(
        body,
        "Diagramme d'états de l'incident, transcription directe",
        "Le diagramme d'états représente les cinq statuts persistés et les transitions autorisées par la politique serveur. INCIDENT_LIFECYCLE.md a été resynchronisé avec le comportement réel avant la finalisation du dossier.",
    )

    # Frontend : extraits exacts et formulations proportionnees.
    replace_paragraph(
        body,
        "Les composants d'affichage sont conçus pour être des unités de présentation pures",
        "Les composants d'affichage sont maintenus aussi déclaratifs que possible. Les calculs de permissions et les chargements sont extraits dans des hooks, tandis que les composants conservent la logique conditionnelle de présentation nécessaire. StarIcon constitue un exemple volontairement pur et réutilisé par IncidentCard et IncidentDetailPanel.",
    )
    star_table = find_body_element(body, "export default function StarIcon")
    star_code = """export default function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\"
      fill={filled ? 'currentColor' : 'none'} stroke=\"currentColor\"
      strokeWidth=\"2\" aria-hidden=\"true\">
      <polygon points=\"12 2 15.1 8.3 22 9.3 17 14.1 18.2 21
        12 17.8 5.8 21 7 14.1 2 9.3 8.9 8.3 12 2\" />
    </svg>
  );
}"""
    star_index = list(body).index(star_table)
    body.remove(star_table)
    body.insert(star_index, make_code_table(star_code))
    replace_paragraph(
        body,
        "La grammaire visuelle repose sur des",
        "La grammaire visuelle utilise douze tokens centralisés : les familles --attention-calm, --attention-watch, --attention-act et --attention-critical sont chacune déclinées en -bg, -border et -text. Une même sémantique d'attention produit ainsi un traitement cohérent dans toute l'application.",
    )
    replace_paragraph(
        body,
        "La logique dynamique (état, appels API, permissions conditionnelles)",
        "Les états, appels API et permissions les plus complexes sont regroupés dans des hooks React réutilisables. useIncidentPermissions centralise les treize permissions directement utiles au volet incident et compose deux groupes supplémentaires pour l'arbitrage.",
    )
    permissions_table = find_body_element(body, "export function useIncidentPermissions")
    permissions_code = """export function useIncidentPermissions(
  incident: WorkshopIncident,
  userRole: Role | undefined,
  userId: number | undefined,
  isResponsable: boolean
) {
  const canRequestEdit = canPerform(userRole, 'requestEdit', incident, userId);
  const canTake = canPerform(userRole, 'take', incident);
  const canClose = canPerform(userRole, 'close', incident);
  const canSetPriority = canPerform(userRole, 'setPriority', incident);
  const hasWorkflowActions = canTake || canSetPending || canResume || canClose || canSetPriority;
  return { canRequestEdit, canTake, canClose, canSetPriority, hasWorkflowActions };
}"""
    permissions_index = list(body).index(permissions_table)
    body.remove(permissions_table)
    body.insert(permissions_index, make_code_table(permissions_code))
    replace_paragraph(
        body,
        "Ce  hook  illustre un principe appliqué",
        "Le masquage d'une action améliore l'expérience utilisateur mais ne constitue jamais la protection. Les règles principales sont reflétées côté client puis revérifiées par le serveur avant chaque mutation. La politique serveur reste l'autorité pour le cycle de vie de l'incident.",
    )

    # Backend : code compilable et portee exacte des patterns.
    replace_paragraph(
        body,
        "backend/src/modules/workshop/ workshop.policy.ts",
        "backend/src/modules/workshop/workshop.policy.ts centralise les dix-huit actions du cycle de vie d'un incident. Les gardes de routes et les permissions des autres modules restent dans leurs middlewares ou services dédiés.",
    )
    policy_table = find_body_element(body, "case  ‘ CANCEL")
    policy_code = """case 'CANCEL':
  // A PENDING incident requires a RESPONSABLE override.
  if (incident.status === 'PENDING') {
    return workshopRole === 'RESPONSABLE';
  }
  return (
    isActiveIncident(incident) &&
    !incident.is_taken &&
    (workshopRole === 'RESPONSABLE' || workshopRole === 'MAINTENANCE')
  );"""
    policy_index = list(body).index(policy_table)
    body.remove(policy_table)
    body.insert(policy_index, make_code_table(policy_code))
    replace_paragraph(
        body,
        "followIncidentService  illustre le pattern transactionnel appliqué à toutes",
        "followIncidentService illustre le modèle appliqué aux mutations critiques du cycle incident : contrôle du rôle, transaction, lecture verrouillée, écriture et événement d'audit atomique. Certaines écritures périphériques plus simples restent implémentées séparément et sont identifiées comme une possibilité d'harmonisation.",
    )
    follow_table = find_body_element(body, "export async function  followIncidentService")
    follow_code = """const result = await withTransaction(async (client) => {
  const current = await workshopRepository.getIncidentById(incidentId, client);
  if (!current) return { kind: 'not_found' as const };
  if (['CLOSED', 'CANCELED', 'INVALIDATED'].includes(current.status)) {
    return { kind: 'forbidden' as const };
  }
  await workshopRepository.followIncidentData(incidentId, actorUserId, client);
  await logIncidentEvent(incidentId, actorUserId, 'INCIDENT_FOLLOWED', {}, client);
  return { kind: 'ok' as const };
});"""
    follow_index = list(body).index(follow_table)
    body.remove(follow_table)
    body.insert(follow_index, make_code_table(follow_code))
    replace_paragraph(
        body,
        "La couche repository est la seule à parler SQL",
        "Les repositories concentrent la majorité du SQL métier. Les migrations et quelques composants transversaux — authentification, notifications et journalisation — interrogent également PostgreSQL directement. Toutes les valeurs issues d'une requête utilisateur sont liées comme paramètres ; les rares fragments structurels dynamiques proviennent de listes internes contrôlées.",
    )
    repository_table = find_body_element(body, "export async function  getIncidentById")
    repository_code = """export async function getIncidentById(
  incidentId: number,
  client?: PoolClient
): Promise<WorkshopIncidentRow | null> {
  const db = client ?? pool;
  const { rows } = await db.query(
    'SELECT * FROM workshop_incidents WHERE id = $1 FOR UPDATE',
    [incidentId]
  );
  return rows[0] ?? null;
}"""
    repository_index = list(body).index(repository_table)
    body.remove(repository_table)
    body.insert(repository_index, make_code_table(repository_code))
    analytics_table = find_body_element(body, "WITH  filtered_incidents")
    analytics_code = """WITH filtered_incidents AS (...),
closed_events AS (
  SELECT incident_id, MIN(created_at) AS closed_at
  FROM workshop_incident_events
  WHERE event_type = 'INCIDENT_CLOSED'
  GROUP BY incident_id
),
day_keys AS (...)
SELECT dk.day::text,
  COUNT(fi.id) FILTER (...) AS created_count,
  COUNT(ce.incident_id) FILTER (...) AS closed_count,
  percentile_cont(0.5) WITHIN GROUP (...) FILTER (...) AS median_take_seconds
FROM day_keys dk
LEFT JOIN filtered_incidents fi ON TRUE
LEFT JOIN closed_events ce ON ce.incident_id = fi.id
GROUP BY dk.day ORDER BY dk.day ASC;"""
    analytics_index = list(body).index(analytics_table)
    body.remove(analytics_table)
    body.insert(analytics_index, make_code_table(analytics_code))
    replace_paragraph(
        body,
        "Chaque route reçoit des données validées par un schéma",
        "Les principaux payloads métier et filtres d'API sont validés par Zod. Certaines routes techniques ou d'administration utilisent des contrôles ciblés et parseIdParam.",
    )
    replace_paragraph(
        body,
        "Les limites de longueur (FIELD_LIMITS)",
        "Le backend constitue l'autorité des limites de champs. Le frontend récupère certaines valeurs via /api/config et conserve une copie de secours pour l'interface ; cette duplication résiduelle est surveillée par les tests et doit rester synchronisée.",
    )
    replace_paragraph(
        body,
        "Toutes les fonctions de service retournent un type uniforme",
        "Les mutations sensibles et les services du workflow Workshop utilisent ServiceResult<T> afin de représenter explicitement les erreurs métier. Plusieurs lectures simples et modules d'administration renvoient encore directement leurs DTO.",
    )
    replace_paragraph(
        body,
        "Le contrôleur sait toujours comment répondre",
        "Lorsqu'un service utilise ServiceResult<T>, le contrôleur traite uniformément l'erreur avec `if (sendServiceError(res, result)) return;`. ErrorCode empêche l'emploi d'un code métier inconnu à la compilation.",
    )

    # Securite : parametres configurables, OWASP complet, veille factuelle.
    replace_paragraph(
        body,
        "—  Durée de session",
        "— Durée de session : huit heures par défaut, configurable dans les limites prévues. À chaque requête protégée, le serveur vérifie la signature du JWT, le compte actif et session_version en base.",
    )
    owasp_table = find_body_element(body, "Risque OWASP Mesure Sentinel")
    owasp_rows = [
        ["Risque OWASP", "Mesure Sentinel"],
        ["A01 — Contrôle d'accès", "Gardes de routes, rôles serveur et politique explicite du workflow incident"],
        ["A02 — Défaillances cryptographiques", "HTTPS, cookies HttpOnly/Secure/SameSite, bcrypt et secrets contrôlés au démarrage"],
        ["A03 — Injection", "Valeurs SQL liées ; fragments structurels limités à des choix internes"],
        ["A04 — Conception non sécurisée", "Matrice de permissions, validation et invariants PostgreSQL"],
        ["A05 — Mauvaise configuration", "assertProductionConfig, origines contrôlées et services internes non exposés"],
        ["A06 — Composants vulnérables", "Dependabot hebdomadaire et npm audit --audit-level=high dans les deux jobs"],
        ["A07 — Authentification", "Bcrypt, codes temporaires, limitation de tentatives et révocation par session_version"],
        ["A08 — Intégrité logicielle", "Lockfiles, npm ci, builds Docker en CI et migrations versionnées"],
        ["A09 — Journalisation", "Événements horodatés avec acteur et journal d'administration"],
        ["A10 — SSRF", "Aucune URL sortante fournie par l'utilisateur ; endpoint DeepSeek fixé côté serveur"],
    ]
    owasp_index = list(body).index(owasp_table)
    body.remove(owasp_table)
    body.insert(owasp_index, make_table(owasp_rows))
    auth_placeholder = find_body_element(body, "EMPLACEMENT SCHÉMA — Séquence — Authentification JWT")
    auth_index = list(body).index(auth_placeholder)
    body.remove(auth_placeholder)
    auth_intro = make_paragraph(
        "Le flux distingue le transport du jeton, sa vérification cryptographique et la revalidation du compte en base. Une suppression de cookie côté navigateur n'est donc pas la seule révocation disponible."
    )
    body.insert(auth_index, auth_intro)
    security_watch = find_body_element(body, "À COMPLÉTER Décrivez ici votre démarche réelle de veille")
    watch_nodes = [
        make_paragraph(
            "La veille sécurité repose d'abord sur des contrôles automatisés et traçables : Dependabot analyse chaque semaine les dépendances npm, les Dockerfiles et les actions GitHub ; les images épinglées uniquement dans Compose font l'objet d'une revue manuelle. La CI exécute npm audit avec un seuil high ; les avis de sécurité npm et les recommandations OWASP servent de grille lors des audits de publication. Pour une exploitation en entreprise, cette veille doit être complétée par les bulletins CERT-FR/ANSSI pertinents pour Node.js, PostgreSQL, Docker et le système du VPS.",
        ),
        make_paragraph(
            "Exemple concret : l'audit d'authentification a identifié des incohérences de révocation et de contrôle des actions sensibles. Les commits 99606b8 et dd17b81 ont ajouté la revalidation des sessions et l'exigence du mot de passe administrateur avant certaines révocations. L'audit final du dossier a ensuite conduit à incrémenter session_version lors d'une réinitialisation de mot de passe ou d'un changement d'activation, afin qu'un ancien JWT ne puisse pas redevenir valable.",
        ),
        make_paragraph(
            "La démarche suivie est : alerte ou constat → reproduction → évaluation de l'impact → correctif minimal → test de non-régression → revue du texte public et du dossier. En juillet 2026, les audits npm backend et frontend ne signalaient aucune vulnérabilité connue au seuil high ; cette situation reste datée et doit être revérifiée avant chaque livraison.",
        ),
    ]
    watch_index = list(body).index(security_watch)
    body.remove(security_watch)
    for offset, node in enumerate(watch_nodes):
        body.insert(watch_index + offset, node)
    dependabot_draft = find_body_element(body, "Dependabot  est déjà activé")
    body.remove(dependabot_draft)

    # RGPD complet, honnete sur le statut de demonstration et les limites actuelles.
    replace_paragraph(
        body,
        "Sentinel traite un minimum de données personnelles",
        "Sentinel traite les données nécessaires aux comptes et à la traçabilité : nom, prénom, badge professionnel, rôle et e-mail professionnel facultatif pour les comptes atelier ; nom d'utilisateur et e-mail professionnel facultatif pour l'administration. Les incidents et événements conservent en outre l'identité professionnelle enregistrée au moment de certaines actions. Une adresse professionnelle nominative reste une donnée personnelle.",
    )
    replace_paragraph(
        body,
        "Intérêt légitime de l'employeur",
        "Sur l'instance publique de démonstration, les comptes et incidents présentés sont des données de test. Dans un déploiement réel, l'entreprise qui détermine les usages devient responsable de traitement. Elle doit confirmer et documenter la base légale adaptée — par exemple son intérêt légitime pour la continuité et la traçabilité des interventions, après analyse de nécessité et de proportionnalité — et informer les personnes avant l'utilisation.",
    )
    replace_paragraph(
        body,
        "Seules trois données identifiantes sont collectées",
        "La collecte est limitée aux informations professionnelles utiles. L'e-mail est facultatif et sert uniquement aux notifications configurées ; son absence ne bloque pas la connexion par badge et mot de passe. Aucune donnée biométrique, géolocalisation, publicité ou mesure d'audience n'est intégrée. Les accès sont limités par rôle et les mots de passe ne sont jamais conservés en clair.",
    )
    replace_paragraph(
        body,
        "Implémentation déjà en place",
        "La désactivation bloque l'accès sans effacer immédiatement le compte. Lors d'une suppression logique, le compte est pseudonymisé : nom générique, badge neutralisé, e-mail et secrets d'authentification supprimés. Cette opération protège le compte opérationnel tout en maintenant les relations nécessaires au fonctionnement de l'historique.",
    )
    replace_paragraph(
        body,
        "Ce choix résout une tension réelle",
        "Les incidents et journaux peuvent conserver un snapshot professionnel du nom, du badge et du rôle au moment de l'action afin de préserver la traçabilité industrielle. L'identité ne disparaît donc pas de toutes les traces. Ces informations doivent rester accessibles aux seules personnes habilitées et être soumises à la politique de conservation du responsable de traitement.",
    )
    retention_placeholder = find_body_element(body, "À COMPLÉTER Décision de politique de rétention")
    retention_nodes = [
        make_paragraph("Politique de conservation proposée", style="Titre3"),
        make_table(
            [
                ["Catégorie", "Critère de conservation et action"],
                ["Compte actif", "Durée de l'habilitation ; désactivation immédiate au départ ou au changement de fonction"],
                ["Compte supprimé", "Pseudonymisation lors de la suppression validée ; e-mail et secrets supprimés"],
                ["Demandes de mot de passe", "Conservation limitée au suivi de traitement, puis purge selon la politique interne"],
                ["Incidents et événements", "Durée requise par les obligations qualité/industrielles applicables au produit, documentée par le responsable ; anonymisation ou purge à l'échéance"],
                ["Journaux de sécurité", "Durée proportionnée à la détection et à l'investigation des incidents, définie dans le registre de traitement"],
                ["Sauvegardes", "Rotation courte documentée et suppression automatique à l'expiration"],
            ]
        ),
        make_paragraph(
            "Sentinel n'applique actuellement aucune purge automatique des incidents et snapshots historiques. Cette limite est explicitement documentée : avant un usage industriel réel, l'entreprise doit fixer les durées ou critères, les inscrire dans son registre, configurer les procédures de purge et tester leur exécution."
        ),
        make_paragraph(
            "L'assistance IA, lorsqu'une clé DeepSeek est configurée, transmet à cette API le message saisi et au maximum les dix derniers échanges. Aucune donnée d'incident ou de compte n'est injectée automatiquement. Les utilisateurs doivent éviter d'y saisir des données personnelles ou confidentielles ; l'entreprise doit valider le contrat, l'hébergement et les éventuels transferts avant activation.",
        ),
    ]
    retention_index = list(body).index(retention_placeholder)
    body.remove(retention_placeholder)
    for offset, node in enumerate(retention_nodes):
        body.insert(retention_index + offset, node)
    replace_paragraph(
        body,
        "—  Accès et rectification",
        "— Accès et rectification : demande auprès du responsable de traitement ; l'administrateur peut corriger le compte mais n'est pas automatiquement le responsable juridique.",
    )
    replace_paragraph(
        body,
        "—  Effacement",
        "— Effacement et limitation : examen de la demande au regard des finalités de traçabilité et des obligations applicables ; pseudonymisation du compte lorsque la suppression est validée.",
    )
    replace_paragraph(
        body,
        "—  Information",
        "— Information et recours : la page /confidentialite décrit données, finalités, destinataires, cookies et droits. L'information de l'entreprise doit préciser son identité, son contact, ses durées et la possibilité de saisir la CNIL.",
    )

    # Jeu d'essai et strategie de tests, chiffres recalcules apres les corrections.
    test_result_table = find_body_element(body, "1. Connexion opératrice POST")
    test_rows = [
        ["Étape", "Entrée", "Attendu", "Résultat vérifié"],
        ["1. Connexion OPERATOR", "POST /api/workshop/auth/login", "200 + cookie HttpOnly", "Session OPERATOR validée"],
        ["2. Création", "POST /api/workshop/incidents", "201 + statut OPEN", "Incident créé et événement CREATED"],
        ["3. Prise en charge", "PATCH isTaken=true par MAINTENANCE", "Pris par le technicien", "taken_at et TAKEN enregistrés"],
        ["4. Mise en attente", "PATCH status=PENDING + diagnostic", "PENDING", "Diagnostic et SET_PENDING enregistrés"],
        ["5. Reprise", "PATCH status=OPEN", "OPEN, toujours pris", "RESUMED enregistré"],
        ["6. Clôture", "PATCH status=CLOSED + note", "CLOSED", "Note et CLOSED enregistrés"],
        ["7. Trace", "GET /incidents/:id/events", "Transitions ordonnées", "CREATED → TAKEN → SET_PENDING → RESUMED → CLOSED"],
    ]
    test_result_index = list(body).index(test_result_table)
    body.remove(test_result_table)
    body.insert(test_result_index, make_table(test_rows))
    replace_paragraph(
        body,
        "Analyse des écarts : aucun. Chaque transition produit",
        "Analyse des écarts : le scénario nominal correspond aux résultats attendus dans les tests d'intégration du commit audité. La trace est append-only par convention applicative ; aucune immuabilité PostgreSQL absolue n'est revendiquée.",
    )
    evidence_placeholder = find_body_element(body, "À COMPLÉTER Captures d'écran des résultats")
    evidence_nodes = [
        make_paragraph(
            f"Vérification locale du {args.audit_date} sur la version corrigée : {args.backend_unit} tests unitaires backend et {args.frontend} tests frontend passants. La suite contient également {args.backend_integration} cas d'intégration PostgreSQL, exécutés par le dernier pipeline GitHub Actions vert capturé au commit {args.commit}. Les captures réelles des trois rôles au §8.2 montrent la traduction des permissions dans l'interface. Cette formulation distingue la vérification locale après correction de la preuve CI antérieure au dépôt final.",
        ),
        make_paragraph(
            "Le jeu d'essai détaillé et reproductible est versionné dans docs/jeu-essai.md. Les valeurs de limite, codes HTTP et préconditions ont été resynchronisés avec le code courant avant la production de ce dossier.",
        ),
    ]
    evidence_index = list(body).index(evidence_placeholder)
    body.remove(evidence_placeholder)
    for offset, node in enumerate(evidence_nodes):
        body.insert(evidence_index + offset, node)

    replace_paragraph(body, "Deux suites de tests indépendantes", "La stratégie combine trois niveaux de tests, répartis entre les deux applications :")
    replace_paragraph(
        body,
        "—  Backend (Jest",
        f"— Backend : {args.backend_unit} tests unitaires Jest, dont certains repositories simulant pg pour vérifier SQL et mapping ; {args.backend_integration} cas d'intégration exécutent les parcours critiques contre PostgreSQL réel en CI.",
    )
    replace_paragraph(
        body,
        "—  Frontend ( Vitest",
        f"— Frontend : {args.frontend} tests Vitest et Testing Library en jsdom, complétés par quatre parcours Playwright exécutés dans la CI.",
    )
    replace_paragraph(
        body,
        "Les deux suites tournent automatiquement",
        "GitHub Actions exécute lint, compilation, tests unitaires, tests frontend, audit de dépendances, construction des images Docker et intégration PostgreSQL. Le déploiement reste volontairement manuel.",
    )
    representative_test = find_body_element(body, "it ( ‘ refuse de suivre")
    test_code = """it('refuse de suivre un incident terminé', async () => {
  const incident = mockIncident({ status: 'CLOSED' });
  jest.mocked(repo.getIncidentById).mockResolvedValue(incident);

  const result = await followIncidentService(1, 7, 'RESPONSABLE');

  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.code).toBe('FORBIDDEN');
  expect(repo.followIncidentData).not.toHaveBeenCalled();
});"""
    representative_index = list(body).index(representative_test)
    body.remove(representative_test)
    body.insert(representative_index, make_code_table(test_code))

    # Deploiement : une seule topologie par environnement et aucune promesse de CD.
    replace_paragraph(
        body,
        "Sentinel est déployé en production sur un VPS",
        "Sentinel dispose d'une instance publique de démonstration sur un VPS Linux, accessible via sentinel.akiksystems.fr. Cette preuve de déploiement technique ne signifie pas que l'application est exploitée par l'entreprise industrielle à l'origine de l'observation.",
    )
    replace_paragraph(
        body,
        "Quatre services Docker Compose",
        "La distribution autonome comporte quatre services Docker Compose : PostgreSQL, backend, frontend/Nginx et Caddy. L'instance publique utilise trois conteneurs et un Nginx hôte ; elle ne lance pas Caddy.",
    )
    deploy_heading = find_body_element(body, "14.3 — CI/CD et migrations", exact=True)
    set_paragraph_text(first_paragraph(deploy_heading), "14.3 — Intégration continue, migrations et sauvegardes")
    replace_paragraph(
        body,
        "GitHub Actions construit et teste à chaque push",
        "GitHub Actions construit et teste à chaque push ou pull request ciblé. Les migrations sont appliquées de façon idempotente au démarrage du backend et PostgreSQL utilise un volume persistant. Les scripts de sauvegarde et restauration sont fournis ; leur planification, leur externalisation et les essais de restauration restent des responsabilités d'exploitation à démontrer séparément.",
    )

    # Bilan personnel : aucun texte de consigne ne subsiste.
    conclusion_placeholder = find_body_element(body, "À COMPLÉTER Votre propre bilan")
    conclusion_nodes = [
        make_paragraph("15.2 — Bilan personnel", style="Titre2"),
        make_paragraph(
            "Sentinel m'a appris qu'une application métier ne se résume pas à faire fonctionner un formulaire et une base de données. Le plus difficile a été de transformer une observation de terrain en règles explicites : qui peut agir, dans quel état, avec quelle trace et quelle conséquence pour les autres utilisateurs. Les corrections les plus formatrices n'ont pas ajouté de fonctionnalités visibles ; elles ont supprimé des ambiguïtés, fermé des fenêtres de concurrence et rendu les décisions vérifiables.",
        ),
        make_paragraph(
            "Si je recommençais, je formaliserais plus tôt le modèle de permissions, le cycle de vie et le plan de tests d'intégration. La première version m'a permis de valider le besoin, mais elle mélangeait prototype et produit. La reconstruction a montré l'intérêt d'accepter de repartir sur des fondations plus simples plutôt que d'empiler des correctifs sur une structure devenue trop limitée.",
        ),
        make_paragraph(
            "Le projet reste perfectible : la purge RGPD doit être configurée pour un contexte d'exploitation réel, les sauvegardes hors site et les restaurations périodiques doivent être prouvées sur chaque environnement, et certaines écritures périphériques pourraient être harmonisées avec le modèle transactionnel principal. Identifier ces limites fait partie du résultat : je peux aujourd'hui distinguer ce qui est démontré, ce qui est seulement prévu et ce qui nécessite une décision de l'organisation.",
        ),
        make_paragraph(
            "Enfin, Sentinel représente pour moi le passage d'un problème vécu comme conducteur de ligne à un système conçu, développé, testé, documenté et déployé. Cette continuité entre expérience métier et développement est l'apport principal du projet et la raison pour laquelle je peux en défendre chaque choix devant le jury.",
        ),
    ]
    conclusion_index = list(body).index(conclusion_placeholder)
    body.remove(conclusion_placeholder)
    for offset, node in enumerate(conclusion_nodes):
        body.insert(conclusion_index + offset, node)
    perspectives_heading = find_body_element(body, "15.2 — Perspectives d'évolution", exact=True)
    set_paragraph_text(first_paragraph(perspectives_heading), "15.3 — Perspectives d'évolution")

    # Retirer les preuves redondantes du corps et les transferer aux annexes.
    move_targets = [
        "media/image8.png", "media/image9.png", "media/image10.png", "media/image13.png",
        "media/image14.png", "media/image15.png", "media/image16.png", "media/image17.png",
        "media/image18.png", "media/image19.png", "media/image20.png", "media/image21.png",
        "media/image22.png", "media/image23.png", "media/image24.png", "media/image33.png",
        "media/image35.png", "media/image37.png",
    ]
    moved_images: list[tuple[str, ET.Element]] = []
    for target in move_targets:
        candidates = image_elements(body, target, rel_targets)
        if candidates:
            element = candidates[0]
            body.remove(element)
            moved_images.append((target, element))

    # Supprimer les duplications de maquettes dans le chapitre des interfaces statiques.
    for target in ("media/image11.png", "media/image19.png"):
        candidates = image_elements(body, target, rel_targets)
        if len(candidates) > 1:
            body.remove(candidates[-1])
        elif candidates and target == "media/image19.png":
            body.remove(candidates[0])

    # La vieille capture CI du chapitre architecture est redondante avec la preuve finale.
    old_ci = image_elements(body, "media/image3.png", rel_targets)
    if old_ci:
        body.remove(old_ci[0])

    captions = {
        "media/image1.png": "Architecture full-stack et responsabilités des couches",
        "media/image2.png": "Services conteneurisés de l'instance publique",
        "media/image3.png": "Ancienne exécution CI conservée en annexe documentaire",
        "media/image4.png": "Portail Sentinel sur l'instance publique de démonstration",
        "media/image5.png": "Design system Sentinel",
        "media/image6.png": "Utilisateurs, rôles et espaces fonctionnels",
        "media/image7.png": "Parcours métier vérifié d'un incident",
        "media/image8.png": "Matrice détaillée des permissions atelier",
        "media/image9.png": "Dashboard annoté du rôle OPERATOR",
        "media/image10.png": "Dashboard annoté du rôle MAINTENANCE",
        "media/image11.png": "Dashboard annoté du rôle RESPONSABLE",
        "media/image12.png": "Création guidée d'un incident",
        "media/image13.png": "Synthèse contextuelle dans le volet incident",
        "media/image14.png": "Connexion Workshop standard",
        "media/image15.png": "Premier accès Workshop par code temporaire",
        "media/image16.png": "Portail Sentinel desktop",
        "media/image17.png": "Actions disponibles pour un OPERATOR",
        "media/image18.png": "Arbitrage d'une demande par un RESPONSABLE",
        "media/image19.png": "Board grand écran en lecture seule",
        "media/image20.png": "Pilotage — diagnostic des lignes",
        "media/image21.png": "Pilotage — indicateurs et concentrations",
        "media/image22.png": "Historique et dossier complet d'un incident",
        "media/image23.png": "Accueil de l'espace Administration",
        "media/image24.png": "Board adapté à un viewport mobile 390 × 844",
        "media/image25.png": "Création d'incident mobile 390 × 844",
        "media/image26.png": "Portail mobile 390 × 844",
        "media/image27.png": "Principes directeurs de la doctrine UX",
        "media/image28.png": "Correspondance doctrine UX et écrans",
        "media/image29.png": "Flux de navigation Board",
        "media/image30.png": "Flux de navigation Administration",
        "media/image31.png": "Flux de navigation Workshop",
        "media/image32.png": "Modèle conceptuel de données",
        "media/image33.png": "Modèle logique de données complet",
        "media/image34.png": "Modèle physique — cœur incident",
        "media/image35.png": "Modèle physique — administration et référentiel",
        "media/image36.png": "Diagramme de cas d'utilisation réel",
        "media/image37.png": "Diagramme de séquence détaillé du workflow incident",
        "media/image38.png": "Diagramme d'états du cycle de vie",
        "media/image39.png": "Dashboard et volet incident mobile",
        "media/image40.png": "Interface réelle du rôle OPERATOR",
        "media/image41.png": "Interface réelle du rôle MAINTENANCE",
        "media/image42.png": "Interface réelle du rôle RESPONSABLE",
        "media/image43.png": "Cinq jobs GitHub Actions réussis au commit audité",
        "media/sequence-workflow-simplifie.png": "Séquence simplifiée du workflow incident",
        "media/auth-jwt-flow.png": "Séquence d'authentification JWT et cookie HttpOnly",
    }

    # Assets visuels corriges. L'absence d'un asset optionnel ne bloque pas le texte.
    media_replacements = {
        "media/image1.png": "architecture-fullstack.png",
        "media/image7.png": "parcours-incident.png",
        "media/image8.png": "permissions-roles.png",
        "media/image31.png": "flux-workshop.png",
        "media/image36.png": "cas-utilisation.png",
    }
    replace_media_from_assets(files, assets_dir, media_replacements)

    # Ajouter une sequence simplifiee dans le corps et le schema JWT manquant.
    image_template_candidates = image_elements(body, "media/image38.png", rel_targets)
    if not image_template_candidates:
        raise ValueError("Image modele introuvable")
    image_template = image_template_candidates[0]
    new_doc_property_id = 500
    sequence_asset = assets_dir / "sequence-workflow-simplifie.png"
    if sequence_asset.exists():
        sequence_bytes = sequence_asset.read_bytes()
        sequence_rel = add_image_relationship(relationships, rel_targets, "sequence-workflow-simplifie.png")
        files["word/media/sequence-workflow-simplifie.png"] = sequence_bytes
        width, height = png_dimensions(sequence_bytes)
        sequence_paragraph = clone_image_paragraph(
            image_template,
            sequence_rel,
            width_px=width,
            height_px=height,
            doc_property_id=new_doc_property_id,
            description=captions["media/sequence-workflow-simplifie.png"],
        )
        sequence_description = find_body_element(body, "Workflow incident complet")
        insert_after(body, sequence_description, [sequence_paragraph])
        new_doc_property_id += 1

    jwt_asset = assets_dir / "auth-jwt-flow.png"
    if jwt_asset.exists():
        jwt_bytes = jwt_asset.read_bytes()
        jwt_rel = add_image_relationship(relationships, rel_targets, "auth-jwt-flow.png")
        files["word/media/auth-jwt-flow.png"] = jwt_bytes
        width, height = png_dimensions(jwt_bytes)
        jwt_paragraph = clone_image_paragraph(
            image_template,
            jwt_rel,
            width_px=width,
            height_px=height,
            doc_property_id=new_doc_property_id,
            description=captions["media/auth-jwt-flow.png"],
        )
        insert_after(body, auth_intro, [jwt_paragraph])

    # Annexes representatives, limitees aux preuves les plus utiles.
    annex_placeholder = find_body_element(body, "À COMPLÉTER 1. Maquettes complètes")
    annex_index = list(body).index(annex_placeholder)
    body.remove(annex_placeholder)
    annex_nodes: list[ET.Element] = [
        make_paragraph("A.1 — Maquettes complémentaires du parcours incident", style="Titre2"),
        make_paragraph(
            "Les planches suivantes complètent les vues retenues dans le corps : comparaison des rôles, authentification, Board, Pilotage, Historique, Administration et responsive. Elles appartiennent au même fichier Figma et correspondent au commit fonctionnel audité."
        ),
    ]
    for target, image_element in moved_images:
        if target in {"media/image33.png", "media/image35.png", "media/image37.png"}:
            continue
        annex_nodes.append(image_element)
    annex_nodes.extend(
        [
            make_paragraph("A.2 — Modèles de données détaillés", style="Titre2", page_break_before=True),
        ]
    )
    for target, image_element in moved_images:
        if target in {"media/image33.png", "media/image35.png"}:
            annex_nodes.append(image_element)
    annex_nodes.extend(
        [
            make_paragraph("A.3 — Séquence complète du workflow", style="Titre2", page_break_before=True),
        ]
    )
    for target, image_element in moved_images:
        if target == "media/image37.png":
            annex_nodes.append(image_element)
    annex_nodes.extend(
        [
            make_paragraph("A.4 — Extraits de code représentatifs", style="Titre2", page_break_before=True),
            make_paragraph("Politique métier — décision CANCEL", style="Titre3"),
            make_code_table(policy_code),
            make_paragraph("Accès aux données — lecture verrouillée", style="Titre3"),
            make_code_table(repository_code),
            make_paragraph("Validation d'une création d'incident", style="Titre3"),
            make_code_table(
                """export const createIncidentSchema = z.object({
  lineId: z.coerce.number().int().positive(),
  machineId: z.string().trim().min(1).max(FIELD_LIMITS.MACHINE_ID),
  robotLabel: z.string().trim().min(1).max(FIELD_LIMITS.ROBOT),
  headNumber: z.coerce.number().int().min(1),
  state: IncidentStateEnum,
  comment: z.string().trim().max(FIELD_LIMITS.COMMENT).optional(),
  currentProduct: z.string().trim().min(1).max(FIELD_LIMITS.PRODUCT),
});"""
            ),
            make_paragraph("A.5 — Traçabilité des preuves", style="Titre2", page_break_before=True),
            make_table(
                [
                    ["Preuve", "Emplacement"],
                    ["Maquettes desktop et mobile", "Fichier Figma et §5 / annexe A.1"],
                    ["Interfaces réelles par rôle", "§8.2"],
                    ["Migrations et schéma", "backend/migrations/ et §6"],
                    ["Jeu d'essai reproductible", "docs/jeu-essai.md et §12"],
                    ["Tests automatisés", "backend/frontend et §13"],
                    ["CI", ".github/workflows/ci.yml et capture §13"],
                    ["Décisions UX", "docs/doctrine-ux.md et docs/plan-ux.md"],
                ]
            ),
        ]
    )
    for offset, node in enumerate(annex_nodes):
        body.insert(annex_index + offset, node)

    # Legendes et descriptions alternatives de toutes les images restantes.
    add_captions_after_images(body, rel_targets, captions, args.source_label)
    update_alt_text(body, rel_targets, captions)

    # Aucun marqueur de brouillon ne doit subsister.
    full_text = element_text(body)
    forbidden_markers = ["À COMPLÉTER", "RESPONSIBLE", "oseas", "return 😉", "ose : OPERATOR"]
    remaining = [marker for marker in forbidden_markers if marker in full_text]
    if remaining:
        raise ValueError(f"Marqueurs interdits encore présents: {remaining}")

    files["word/document.xml"] = ET.tostring(document, encoding="utf-8", xml_declaration=True)
    files["word/_rels/document.xml.rels"] = ET.tostring(
        relationships, encoding="utf-8", xml_declaration=True
    )
    update_core_properties(files)
    ensure_fields_update(files)

    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, data in files.items():
            archive.writestr(name, data)

    print(output)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", default="Dossier-projet-Sentinel-DWWM.docx")
    parser.add_argument("--output", default="Dossier-projet-Sentinel-DWWM-CORRIGE.docx")
    parser.add_argument("--assets-dir", default="docs/dossier-projet/assets-corrected")
    parser.add_argument("--backend-unit", type=int, required=True)
    parser.add_argument("--backend-integration", type=int, required=True)
    parser.add_argument("--frontend", type=int, required=True)
    parser.add_argument("--deposit-date", required=True)
    parser.add_argument("--audit-date", required=True)
    parser.add_argument("--commit", required=True)
    parser.add_argument("--source-label", required=True)
    rebuild(parser.parse_args())


if __name__ == "__main__":
    main()
