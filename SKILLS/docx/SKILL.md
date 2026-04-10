---
name: docx
description: 'Comprehensive document creation, editing, and analysis with support for tracked changes, comments, formatting preservation, and text extraction. When Claude needs to work with professional documents (.docx files) for: (1) Creating new documents, (2) Modifying or editing content, (3) Working with tracked changes, (4) Adding comments, or any other document tasks'
license: Proprietary. LICENSE.txt has complete terms
official: true
---

# DOCX creation, editing, and analysis

## Execution Environment

**Use the `run_script` tool to execute all scripts. Do NOT attempt direct bash/shell execution.**

### Rules

1. Use `run_script` with the absolute script path
2. Script paths use `$SKILLS_ROOT` prefix: `$SKILLS_ROOT/docx/scripts/<file>.py`
3. Output files MUST be written to `os.environ['OUTPUT_DIR']` — **never hardcode any other path** (e.g. `docs/`, `outputs/`, `process.cwd()`). Files written outside OUTPUT_DIR will NOT appear in `output_files` and the file card will be broken.
4. `run_script` returns JSON — `output_files[].url` is the file card link; `output_files[].path` is the real filesystem path
5. In your reply, use the `url` field to render the file card: `[filename.docx](output_files[].url)` — always use `output_files[].url` as-is; never hand-write or truncate the URL (it contains a required `?localPath=` parameter)
6. **For dynamically generated scripts**: use `script_content` parameter to provide the script source inline — the tool will create the file automatically before running it. **CRITICAL: Use `$DATA_SKILLS_DIR/tmp/<file>` as the path for dynamically generated scripts** (never inside `SKILLS/` which is read-only) to keep generated files out of version control.

### Output filename convention

**NEVER use generic names** like `test.docx`, `document.docx`, or `output.docx`.

- Derive the name from the task content (2–4 English words, snake_case)
- Append a 6-character random suffix to prevent overwrites
- Example: `stock_report_a3f9k2.docx`, `meeting_notes_x7q1p5.docx`

```python
# Python (preferred)
import random, string
rand = ''.join(random.choices(string.ascii_lowercase + string.digits, k=6))
filename = f'stock_report_{rand}.docx'
```

```js
// JavaScript (fallback)
const rand = Math.random().toString(36).slice(2, 8);
const filename = `stock_report_${rand}.docx`;
```

### Python dependencies (declare inline for uv) — **preferred language**

```python
# /// script
# requires-python = ">=3.10"
# dependencies = ["python-docx"]
# ///
import docx, os, random, string
rand = ''.join(random.choices(string.ascii_lowercase + string.digits, k=6))
filename = f'document_{rand}.docx'
doc = docx.Document()
# ... build document ...
doc.save(os.path.join(os.environ['OUTPUT_DIR'], filename))
```

### JavaScript (Node.js) — `docx` npm package is pre-installed (use only when Python is unavailable)

The `docx` npm package is already installed in the project. JS/MJS scripts can import it directly.
Output files MUST be written to `process.env.OUTPUT_DIR`.

```js
import { Document, Packer, Paragraph, TextRun } from 'docx';
import fs from 'fs';
import path from 'path';

const doc = new Document({
  sections: [{ children: [new Paragraph({ children: [new TextRun('Hello World')] })] }],
});
const buffer = await Packer.toBuffer(doc);
const rand = Math.random().toString(36).slice(2, 8);
fs.writeFileSync(path.join(process.env.OUTPUT_DIR, `document_${rand}.docx`), buffer);
console.log('done');
```

**Example `run_script` call with inline content (Python preferred):**

```json
{
  "script_path": "<PROJECT_ROOT>/data/skills/tmp/create_doc.py",
  "script_content": "# /// script\n# requires-python = '>=3.10'\n# dependencies = ['python-docx']\n# ///\nimport docx, os, random, string\nrand = ''.join(random.choices(string.ascii_lowercase + string.digits, k=6))\nfilename = f'hello_world_{rand}.docx'\ndoc = docx.Document()\ndoc.add_paragraph('Hello World')\ndoc.save(os.path.join(os.environ['OUTPUT_DIR'], filename))\nprint('created:', filename)\n"
}
```

> **script_path 说明**：将 `<PROJECT_ROOT>` 替换为实际项目根目录的绝对路径。`DATA_SKILLS_DIR` 环境变量（在脚本内可用）即指向 `<PROJECT_ROOT>/data/skills`。

> **Tauri desktop**: Files are saved locally and opened with the system's default application.

## Overview

A user may ask you to create, edit, or analyze the contents of a .docx file. A .docx file is essentially a ZIP archive containing XML files and other resources that you can read or edit. You have different tools and workflows available for different tasks.

## Workflow Decision Tree

### Reading/Analyzing Content

Use "Text extraction" or "Raw XML access" sections below

### Creating New Document

Use "Creating a new Word document" workflow

### Editing Existing Document

- **Your own document + simple changes**
  Use "Basic OOXML editing" workflow

- **Someone else's document**
  Use **"Redlining workflow"** (recommended default)

- **Legal, academic, business, or government docs**
  Use **"Redlining workflow"** (required)

## Reading and analyzing content

### Text extraction

If you just need to read the text contents of a document, you should convert the document to markdown using pandoc. Pandoc provides excellent support for preserving document structure and can show tracked changes:

```bash
# Convert document to markdown with tracked changes
pandoc --track-changes=all path-to-file.docx -o output.md
# Options: --track-changes=accept/reject/all
```

### Raw XML access

You need raw XML access for: comments, complex formatting, document structure, embedded media, and metadata. For any of these features, you'll need to unpack a document and read its raw XML contents.

#### Unpacking a file

`python ooxml/scripts/unpack.py <office_file> <output_directory>`

#### Key file structures

- `word/document.xml` - Main document contents
- `word/comments.xml` - Comments referenced in document.xml
- `word/media/` - Embedded images and media files
- Tracked changes use `<w:ins>` (insertions) and `<w:del>` (deletions) tags

## Creating a new Word document

When creating a new Word document from scratch, use **docx-js**, which allows you to create Word documents using JavaScript/TypeScript.

### Workflow

1. **MANDATORY - READ ENTIRE FILE**: Read [`docx-js.md`](docx-js.md) (~500 lines) completely from start to finish. **NEVER set any range limits when reading this file.** Read the full file content for detailed syntax, critical formatting rules, and best practices before proceeding with document creation.
2. Create a JavaScript/TypeScript file using Document, Paragraph, TextRun components (You can assume all dependencies are installed, but if not, refer to the dependencies section below)
3. Export as .docx using Packer.toBuffer()

## Editing an existing Word document

When editing an existing Word document, use the **Document library** (a Python library for OOXML manipulation). The library automatically handles infrastructure setup and provides methods for document manipulation. For complex scenarios, you can access the underlying DOM directly through the library.

### Workflow

1. **MANDATORY - READ ENTIRE FILE**: Read [`ooxml.md`](ooxml.md) (~600 lines) completely from start to finish. **NEVER set any range limits when reading this file.** Read the full file content for the Document library API and XML patterns for directly editing document files.
2. Unpack the document: `python ooxml/scripts/unpack.py <office_file> <output_directory>`
3. Create and run a Python script using the Document library (see "Document Library" section in ooxml.md)
4. Pack the final document: `python ooxml/scripts/pack.py <input_directory> <office_file>`

The Document library provides both high-level methods for common operations and direct DOM access for complex scenarios.

## Redlining workflow for document review

This workflow allows you to plan comprehensive tracked changes using markdown before implementing them in OOXML. **CRITICAL**: For complete tracked changes, you must implement ALL changes systematically.

**Batching Strategy**: Group related changes into batches of 3-10 changes. This makes debugging manageable while maintaining efficiency. Test each batch before moving to the next.

**Principle: Minimal, Precise Edits**
When implementing tracked changes, only mark text that actually changes. Repeating unchanged text makes edits harder to review and appears unprofessional. Break replacements into: [unchanged text] + [deletion] + [insertion] + [unchanged text]. Preserve the original run's RSID for unchanged text by extracting the `<w:r>` element from the original and reusing it.

Example - Changing "30 days" to "60 days" in a sentence:

```python
# BAD - Replaces entire sentence
'<w:del><w:r><w:delText>The term is 30 days.</w:delText></w:r></w:del><w:ins><w:r><w:t>The term is 60 days.</w:t></w:r></w:ins>'

# GOOD - Only marks what changed, preserves original <w:r> for unchanged text
'<w:r w:rsidR="00AB12CD"><w:t>The term is </w:t></w:r><w:del><w:r><w:delText>30</w:delText></w:r></w:del><w:ins><w:r><w:t>60</w:t></w:r></w:ins><w:r w:rsidR="00AB12CD"><w:t> days.</w:t></w:r>'
```

### Tracked changes workflow

1. **Get markdown representation**: Convert document to markdown with tracked changes preserved:

   ```bash
   pandoc --track-changes=all path-to-file.docx -o current.md
   ```

2. **Identify and group changes**: Review the document and identify ALL changes needed, organizing them into logical batches:

   **Location methods** (for finding changes in XML):
   - Section/heading numbers (e.g., "Section 3.2", "Article IV")
   - Paragraph identifiers if numbered
   - Grep patterns with unique surrounding text
   - Document structure (e.g., "first paragraph", "signature block")
   - **DO NOT use markdown line numbers** - they don't map to XML structure

   **Batch organization** (group 3-10 related changes per batch):
   - By section: "Batch 1: Section 2 amendments", "Batch 2: Section 5 updates"
   - By type: "Batch 1: Date corrections", "Batch 2: Party name changes"
   - By complexity: Start with simple text replacements, then tackle complex structural changes
   - Sequential: "Batch 1: Pages 1-3", "Batch 2: Pages 4-6"

3. **Read documentation and unpack**:
   - **MANDATORY - READ ENTIRE FILE**: Read [`ooxml.md`](ooxml.md) (~600 lines) completely from start to finish. **NEVER set any range limits when reading this file.** Pay special attention to the "Document Library" and "Tracked Change Patterns" sections.
   - **Unpack the document**: `python ooxml/scripts/unpack.py <file.docx> <dir>`
   - **Note the suggested RSID**: The unpack script will suggest an RSID to use for your tracked changes. Copy this RSID for use in step 4b.

4. **Implement changes in batches**: Group changes logically (by section, by type, or by proximity) and implement them together in a single script. This approach:
   - Makes debugging easier (smaller batch = easier to isolate errors)
   - Allows incremental progress
   - Maintains efficiency (batch size of 3-10 changes works well)

   **Suggested batch groupings:**
   - By document section (e.g., "Section 3 changes", "Definitions", "Termination clause")
   - By change type (e.g., "Date changes", "Party name updates", "Legal term replacements")
   - By proximity (e.g., "Changes on pages 1-3", "Changes in first half of document")

   For each batch of related changes:

   **a. Map text to XML**: Grep for text in `word/document.xml` to verify how text is split across `<w:r>` elements.

   **b. Create and run script**: Use `get_node` to find nodes, implement changes, then `doc.save()`. See **"Document Library"** section in ooxml.md for patterns.

   **Note**: Always grep `word/document.xml` immediately before writing a script to get current line numbers and verify text content. Line numbers change after each script run.

5. **Pack the document**: After all batches are complete, convert the unpacked directory back to .docx:

   ```bash
   python ooxml/scripts/pack.py unpacked reviewed-document.docx
   ```

6. **Final verification**: Do a comprehensive check of the complete document:
   - Convert final document to markdown:
     ```bash
     pandoc --track-changes=all reviewed-document.docx -o verification.md
     ```
   - Verify ALL changes were applied correctly:
     ```bash
     grep "original phrase" verification.md  # Should NOT find it
     grep "replacement phrase" verification.md  # Should find it
     ```
   - Check that no unintended changes were introduced

## Converting Documents to Images

To visually analyze Word documents, convert them to images using a two-step process:

1. **Convert DOCX to PDF**:

   ```bash
   soffice --headless --convert-to pdf document.docx
   ```

2. **Convert PDF pages to JPEG images**:
   ```bash
   pdftoppm -jpeg -r 150 document.pdf page
   ```
   This creates files like `page-1.jpg`, `page-2.jpg`, etc.

Options:

- `-r 150`: Sets resolution to 150 DPI (adjust for quality/size balance)
- `-jpeg`: Output JPEG format (use `-png` for PNG if preferred)
- `-f N`: First page to convert (e.g., `-f 2` starts from page 2)
- `-l N`: Last page to convert (e.g., `-l 5` stops at page 5)
- `page`: Prefix for output files

Example for specific range:

```bash
pdftoppm -jpeg -r 150 -f 2 -l 5 document.pdf page  # Converts only pages 2-5
```

## Code Style Guidelines

**IMPORTANT**: When generating code for DOCX operations:

- Write concise code
- Avoid verbose variable names and redundant operations
- Avoid unnecessary print statements

## Dependencies

Required dependencies (install if not available):

- **pandoc**: `sudo apt-get install pandoc` (for text extraction)
- **docx**: `npm install -g docx` (for creating new documents)
- **LibreOffice**: `sudo apt-get install libreoffice` (for PDF conversion)
- **Poppler**: `sudo apt-get install poppler-utils` (for pdftoppm to convert PDF to images)
- **defusedxml**: `pip install defusedxml` (for secure XML parsing)
