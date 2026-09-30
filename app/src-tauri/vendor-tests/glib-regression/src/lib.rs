#[cfg(test)]
mod tests {
    use glib::{variant::ToVariant, Variant};

    // RUSTSEC-2024-0429: optimization can discard the C function's write to
    // the out-pointer when passed through an immutable Rust reference.
    #[test]
    fn string_array_iteration_returns_valid_borrowed_strings() {
        let values = ["alpha", "βeta", "", "omega"];
        let variant = Variant::array_from_iter::<String>(values.iter().map(|s| s.to_variant()));
        assert_eq!(
            variant.array_iter_str().unwrap().collect::<Vec<_>>(),
            values
        );
        assert_eq!(
            variant.array_iter_str().unwrap().rev().collect::<Vec<_>>(),
            values.iter().rev().copied().collect::<Vec<_>>()
        );
        assert_eq!(variant.array_iter_str().unwrap().nth(1), Some("βeta"));
        assert_eq!(variant.array_iter_str().unwrap().nth_back(1), Some(""));
        assert_eq!(variant.array_iter_str().unwrap().last(), Some("omega"));
    }
}
