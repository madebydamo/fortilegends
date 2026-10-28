"""MkDocs Simple Blog theme package."""

__version__ = "0.6.1"

__author__ = "Fernando Celmer <email@fernandocelmer.com>"


def _install_social_card_filter() -> None:
    """Register the social_card Jinja filter when this theme is loaded.

    The filter has to be available without enabling a plugin in mkdocs.yml
    (production config lives on the content volume, not in this image).
    """
    try:
        from mkdocs.theme import Theme
    except ImportError:  # pragma: no cover
        return
    if getattr(Theme.get_env, "_simple_blog_social", False):
        return

    original = Theme.get_env

    def get_env(self):
        env = original(self)
        name = getattr(self, "name", None)
        dirs = getattr(self, "dirs", None) or []
        if name == "simple-blog" or any(
            "mkdocs_simple_blog" in str(path) for path in dirs
        ):
            from mkdocs_simple_blog.plugin.social import install_filters

            install_filters(env)
        return env

    get_env._simple_blog_social = True
    Theme.get_env = get_env


def _install_utf8_content_type() -> None:
    """Send `charset=utf-8` with text files under `mkdocs serve`.

    Production runs `mkdocs serve`, which answers llms.txt / robots.txt with a
    bare `text/plain`. Browsers then guess Windows-1252 and show umlauts as
    `Ã¤`. The files are UTF-8, so say so.
    """
    try:
        from mkdocs.livereload import LiveReloadServer
    except ImportError:  # pragma: no cover
        return
    original = LiveReloadServer.__dict__.get("_guess_type")
    guess = getattr(original, "__func__", None)
    if guess is None or getattr(guess, "_simple_blog_utf8", False):
        return

    def _guess_type(cls, path):
        content_type = guess(cls, path)
        if "charset" not in content_type and (
            content_type.startswith("text/")
            or content_type
            in ("application/javascript", "application/json", "application/xml")
        ):
            content_type += "; charset=utf-8"
        return content_type

    _guess_type._simple_blog_utf8 = True
    LiveReloadServer._guess_type = classmethod(_guess_type)


_install_social_card_filter()
_install_utf8_content_type()
