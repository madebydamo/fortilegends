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


_install_social_card_filter()
