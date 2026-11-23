"""Native Windows window for the local editor. No external browser process."""

def show_editor(url):
    import webview
    webview.settings['ALLOW_DOWNLOADS'] = True
    webview.create_window('Poknapham Editing Suite', url, width=1440, height=900,
                          min_size=(960, 640), resizable=True)
    webview.start(gui='edgechromium', private_mode=False)
