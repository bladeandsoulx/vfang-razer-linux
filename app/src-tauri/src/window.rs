use tauri::WebviewWindow;

pub(crate) fn repair_csd_titlebar_input(window: &WebviewWindow) {
    #[cfg(target_os = "linux")]
    linux::repair_csd_titlebar_input(window);

    #[cfg(not(target_os = "linux"))]
    let _ = window;
}

#[cfg(target_os = "linux")]
mod linux {
    use gtk::prelude::*;
    use tauri::WebviewWindow;

    pub(super) fn repair_csd_titlebar_input(window: &WebviewWindow) {
        let handle = window.clone();
        if let Err(error) = window.run_on_main_thread(move || {
            let Ok(gtk_window) = handle.gtk_window() else {
                log::debug!("native GTK window is unavailable; skipping CSD input repair");
                return;
            };
            let Some(titlebar) = gtk_window.titlebar() else {
                log::debug!("native GTK title bar is unavailable; skipping CSD input repair");
                return;
            };

            if lower_titlebar_event_box(&titlebar) {
                log::debug!("repaired native Wayland title-bar input ordering");
            }
        }) {
            log::debug!("could not schedule native title-bar input repair: {error}");
        }
    }

    // Temporary compatibility fix for tauri-apps/tao#1218. Remove this
    // helper and the direct GTK dependency after Tauri resolves TAO >= 0.36.
    pub(super) fn lower_titlebar_event_box(titlebar: &gtk::Widget) -> bool {
        let Some(event_box) = titlebar.downcast_ref::<gtk::EventBox>() else {
            return false;
        };
        if !event_box.is_above_child() {
            return false;
        }
        event_box.set_above_child(false);
        true
    }
}

#[cfg(all(test, target_os = "linux"))]
mod tests {
    use super::linux::lower_titlebar_event_box;
    use gtk::prelude::*;

    #[test]
    fn changes_only_the_affected_event_box_input_order() {
        gtk::init().expect("GTK test display");

        let event_box = gtk::EventBox::new();
        event_box.set_above_child(true);
        let event_box_widget = event_box.clone().upcast::<gtk::Widget>();

        assert!(lower_titlebar_event_box(&event_box_widget));
        assert!(!event_box.is_above_child());
        assert!(!lower_titlebar_event_box(&event_box_widget));

        let label = gtk::Label::new(Some("ordinary title"));
        let label_widget = label.upcast::<gtk::Widget>();
        assert!(!lower_titlebar_event_box(&label_widget));
    }
}
