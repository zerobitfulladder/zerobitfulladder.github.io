"""Core build logic for Malvolio static site generator."""

import os
import re
import shutil
from datetime import datetime
from pathlib import Path

import jinja2
import yaml
from jinja2.runtime import Macro

from .config import Config, PageConfig, SITE_DESCRIPTION, SITE_TITLE, StaticPage


class SiteBuilder:
    """Builds the static site from templates and content."""

    def __init__(self, config: Config | None = None):
        """Initialize the builder with configuration.
        
        Args:
            config: Site configuration. Uses defaults if not provided.
        """
        self.config = config or Config()
        self.env = jinja2.Environment(
            loader=jinja2.FileSystemLoader(self.config.templates_dir)
        )
        self._register_macros()

    def _register_macros(self) -> None:
        """Expose macros.html macros as globals, so content files call them directly."""
        try:
            module = self.env.get_template("macros.html").module
        except jinja2.TemplateNotFound:
            return
        self.env.globals.update({
            name: value
            for name in dir(module)
            if isinstance(value := getattr(module, name), Macro)
        })

    def clean(self) -> None:
        """Remove all generated output files and directories."""
        # Remove output files
        for output_file in self.config.output_files:
            output_file.unlink(missing_ok=True)
            print(f"Removed: {output_file}")
        
        # Remove output directories
        for output_dir in self.config.output_dirs:
            if output_dir.exists():
                shutil.rmtree(output_dir)
                print(f"Removed: {output_dir}")

    def build(self) -> None:
        """Build the complete site."""
        for static_page in self.config.static_pages:
            self._render_static(static_page)
        for page in self.config.pages:
            self._render_page(page)
        print("Build complete.")

    def rebuild(self) -> None:
        """Clean and rebuild the complete site."""
        self.clean()
        self.build()

    def _render_static(self, page: StaticPage) -> None:
        """Render a page that has no meta.yaml behind it.

        Args:
            page: Static page configuration.
        """
        content = self.env.get_template(page.template).render()
        rendered_html = self._wrap(content, page.title, page.description)

        output_file = self.config.public_dir / page.output
        self._write_output(output_file, rendered_html)
        print(f"Rendered: {output_file}")

    def _render_page(self, page: PageConfig) -> None:
        """Render a single page from its configuration.
        
        Args:
            page: Page configuration containing meta file, template, etc.
        """
        if not os.path.exists(page.meta_file):
            print(f"Warning: Meta file {page.meta_file} not found, skipping.")
            return

        # Load meta.yaml
        with open(page.meta_file, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f)

        # Handle empty meta.yaml - render page with empty items
        if not data:
            print(f"Warning: {page.meta_file} is empty, rendering with no items.")
            data = {}

        # Extract items as list of dicts with href
        keys = list(data.keys())
        items = list(data.values())

        # Sort items by date (newest to oldest) for thought pages
        if page.name == "thought":
            def parse_date(date_str: str) -> datetime:
                """Parse date string in DD/MM/YYYY format."""
                parts = date_str.split('/')
                return datetime(int(parts[2]), int(parts[1]), int(parts[0]))
            
            # Create list of (key, item) pairs, sort by date, then unpack
            keyed_items = list(zip(keys, items))
            keyed_items.sort(key=lambda x: parse_date(x[1].get("date", "01/01/1970")), reverse=True)
            keys = [k for k, _ in keyed_items]
            items = [i for _, i in keyed_items]

        # Collect all unique tags
        all_tags = set()
        for item in items:
            if "tags" in item and not item.get("draft"):
                all_tags.update(item["tags"])
        all_tags = sorted(list(all_tags))

        for item, key in zip(items, keys):
            item["href"] = f"{page.content_dir}/{key}.html"
            # Calculate reading time from content file
            source_file = page.source_dir / f"{key}.html"
            if source_file.exists():
                with open(source_file, "r", encoding="utf-8") as f:
                    content = f.read()
                # Strip HTML tags for word count
                text = re.sub(r"<[^>]+>", "", content)
                word_count = len(text.split())
                reading_time = max(1, round(word_count / 220))
                item["reading_time"] = reading_time
            else:
                item["reading_time"] = 1

        # Drafts still build their own page, but stay off the index.
        listed = [item for item in items if not item.get("draft")]

        page_template = self.env.get_template(page.template)
        content_html = page_template.render(items=listed, all_tags=all_tags)

        rendered_html = self._wrap(content_html, page.title)

        self._write_output(page.output_file, rendered_html)
        print(f"Rendered: {page.output_file}")
        
        # Render individual content pages
        self._render_content_pages(page, keys, items)

    def _render_content_pages(self, page: PageConfig, keys: list, items: list) -> None:
        """Render individual content pages wrapped in base template.
        
        Args:
            page: Page configuration.
            keys: List of content keys (slugs).
            items: List of content items with metadata.
        """
        for key, item in zip(keys, items):
            source_file = page.source_dir / f"{key}.html"
            output_file = self.config.public_dir / page.content_dir / f"{key}.html"
            
            if not os.path.exists(source_file):
                print(f"Warning: Content file {source_file} not found, skipping.")
                continue
            
            # Read the raw HTML content
            with open(source_file, "r", encoding="utf-8") as f:
                raw_content = f.read()
            
            body = self.env.from_string(raw_content).render(**item)
            article = self.env.get_template("article.html").render(body=body, **item)

            heading = item.get("heading", SITE_TITLE)
            summary = item.get("summary", SITE_DESCRIPTION)
            rendered_html = self._wrap(article, f"{heading} — {SITE_TITLE}", summary)
            
            # Write to output directory
            self._write_output(output_file, rendered_html)
            print(f"Rendered: {output_file}")

    def _wrap(self, content: str, title: str, description: str = SITE_DESCRIPTION) -> str:
        """Wrap rendered content in the base template.

        Args:
            content: Inner HTML.
            title: Value for the <title> tag.
            description: Value for the meta/OG description.
        """
        base_template = self.env.get_template("base.html")
        return base_template.render(content=content, title=title, description=description)

    def _write_output(self, path: Path, content: str) -> None:
        """Write content to an output file.
        
        Args:
            path: Output file path.
            content: HTML content to write.
        """
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)
