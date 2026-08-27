"""Configuration management for Malvolio."""

from dataclasses import dataclass, field
from pathlib import Path

SITE_TITLE = "Tuğrul Ağrikli"
SITE_DESCRIPTION = (
    "Systems and machine learning engineer in Istanbul. "
    "Computer vision on the edge, desktop shells, LLM-driven agents."
)
SITE_URL = "https://zerobitfulladder.github.io"


@dataclass
class StaticPage:
    """A page rendered straight from a template, with no meta.yaml behind it."""
    name: str
    template: str
    output: str
    title: str
    description: str = SITE_DESCRIPTION
    standalone: bool = False   # rendered as-is, without base.html's chrome


@dataclass
class PageConfig:
    """Configuration for a single meta.yaml-driven list page."""
    name: str
    meta_file: Path
    content_dir: str  # URL path for hrefs (e.g., "content/thought")
    template: str
    output_file: Path
    source_dir: Path  # Source directory for content files
    title: str


@dataclass
class Config:
    """Site configuration with sensible defaults."""

    templates_dir: Path = field(default_factory=lambda: Path("templates"))
    public_dir: Path = field(default_factory=lambda: Path("docs"))
    source_dir: Path = field(default_factory=lambda: Path("content"))

    static_pages: list[StaticPage] = field(default_factory=list)
    pages: list[PageConfig] = field(default_factory=list)

    def __post_init__(self):
        if not self.static_pages:
            self.static_pages = [
                StaticPage(
                    name="index",
                    template="index.html",
                    output="index.html",
                    title=SITE_TITLE,
                ),
                StaticPage(
                    name="cv",
                    template="cv.html",
                    output="cv.html",
                    title=f"CV — {SITE_TITLE}",
                    description="Curriculum vitae: education, systems, and client work.",
                ),
                StaticPage(
                    name="splat",
                    template="splat.html",
                    output="splat.html",
                    title="Scan",
                    description="Gaussian-splat viewer.",
                    standalone=True,
                ),
                StaticPage(
                    name="babam",
                    template="babam.html",
                    output="babam.html",
                    title="Scan",
                    description="Gaussian-splat viewer.",
                    standalone=True,
                ),
                StaticPage(
                    name="music",
                    template="music.html",
                    output="music.html",
                    title=f"Music — {SITE_TITLE}",
                    description="Artists I keep coming back to.",
                ),
            ]

        if not self.pages:
            self.pages = [
                PageConfig(
                    name="thought",
                    meta_file=self.source_dir / "thought" / "meta.yaml",
                    content_dir="content/thought",
                    template="thought.html",
                    output_file=self.public_dir / "thought.html",
                    source_dir=self.source_dir / "thought",
                    title=f"Thoughts — {SITE_TITLE}",
                ),
                PageConfig(
                    name="experience",
                    meta_file=self.source_dir / "experience" / "meta.yaml",
                    content_dir="content/experience",
                    template="experience.html",
                    output_file=self.public_dir / "experience.html",
                    source_dir=self.source_dir / "experience",
                    title=f"Work — {SITE_TITLE}",
                ),
            ]

    @property
    def output_files(self) -> list[Path]:
        """All output files that should be cleaned."""
        static = [self.public_dir / p.output for p in self.static_pages]
        return static + [page.output_file for page in self.pages]

    @property
    def output_dirs(self) -> list[Path]:
        """All output directories that should be cleaned."""
        return [self.public_dir / "content"]

    @property
    def watch_paths(self) -> list[Path]:
        """Paths to watch for changes."""
        return [self.templates_dir, self.source_dir]
