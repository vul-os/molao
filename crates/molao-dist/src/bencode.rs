//! A minimal bencode codec.
//!
//! `torrent.rs` needs exactly four things — integers, byte strings, lists,
//! and dictionaries with keys sorted as raw bytes — and nothing else. There
//! is no bencode crate in the parent workspace's dependency set, the format
//! is small, stable, and specified precisely enough (BEP 3) that hand-rolling
//! it here is less risk than adding a dependency whose maintenance and
//! correctness this project would then be trusting for something this
//! self-contained.
//!
//! Dict keys are sorted using `BTreeMap<Vec<u8>, _>`, whose `Ord` on `Vec<u8>`
//! is exactly bencode's required byte-wise key order — real torrent clients
//! reject a `.torrent` whose dict keys are not in this order, so getting it
//! for free from the collection type rather than sorting by hand at encode
//! time removes a whole class of possible bug.

use std::collections::BTreeMap;

/// A bencode value.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BValue {
    Int(i64),
    Bytes(Vec<u8>),
    List(Vec<BValue>),
    Dict(BTreeMap<Vec<u8>, BValue>),
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum BencodeError {
    #[error("unexpected end of input")]
    UnexpectedEof,
    #[error("expected {0}")]
    Expected(&'static str),
    #[error("invalid integer")]
    InvalidInt,
    #[error("trailing data after the top-level value")]
    TrailingData,
}

impl BValue {
    pub fn bytes(s: impl Into<Vec<u8>>) -> Self {
        BValue::Bytes(s.into())
    }

    /// Encode to bencode bytes. Deterministic: the same value always
    /// produces the same bytes, which is the property `torrent.rs` relies on
    /// for reproducible `.torrent` output.
    pub fn encode(&self) -> Vec<u8> {
        let mut out = Vec::new();
        self.encode_into(&mut out);
        out
    }

    fn encode_into(&self, out: &mut Vec<u8>) {
        match self {
            BValue::Int(n) => {
                out.push(b'i');
                out.extend_from_slice(n.to_string().as_bytes());
                out.push(b'e');
            }
            BValue::Bytes(b) => {
                out.extend_from_slice(b.len().to_string().as_bytes());
                out.push(b':');
                out.extend_from_slice(b);
            }
            BValue::List(items) => {
                out.push(b'l');
                for item in items {
                    item.encode_into(out);
                }
                out.push(b'e');
            }
            BValue::Dict(map) => {
                out.push(b'd');
                // `BTreeMap` iterates in key order already; bencode requires
                // exactly that order for dict keys.
                for (k, v) in map {
                    encode_bytes_into(k, out);
                    v.encode_into(out);
                }
                out.push(b'e');
            }
        }
    }

    /// Decode a single top-level value. Errors if there is anything left
    /// over afterwards — a `.torrent` file is one bencode value, not a
    /// stream of them.
    pub fn decode(input: &[u8]) -> Result<Self, BencodeError> {
        let mut pos = 0;
        let value = decode_value(input, &mut pos)?;
        if pos != input.len() {
            return Err(BencodeError::TrailingData);
        }
        Ok(value)
    }

    pub fn as_dict(&self) -> Option<&BTreeMap<Vec<u8>, BValue>> {
        match self {
            BValue::Dict(m) => Some(m),
            _ => None,
        }
    }

    pub fn as_int(&self) -> Option<i64> {
        match self {
            BValue::Int(n) => Some(*n),
            _ => None,
        }
    }

    pub fn as_bytes(&self) -> Option<&[u8]> {
        match self {
            BValue::Bytes(b) => Some(b),
            _ => None,
        }
    }
}

fn encode_bytes_into(b: &[u8], out: &mut Vec<u8>) {
    out.extend_from_slice(b.len().to_string().as_bytes());
    out.push(b':');
    out.extend_from_slice(b);
}

fn decode_value(input: &[u8], pos: &mut usize) -> Result<BValue, BencodeError> {
    match input.get(*pos) {
        None => Err(BencodeError::UnexpectedEof),
        Some(b'i') => decode_int(input, pos),
        Some(b'l') => decode_list(input, pos),
        Some(b'd') => decode_dict(input, pos),
        Some(c) if c.is_ascii_digit() => decode_bytes(input, pos).map(BValue::Bytes),
        Some(_) => Err(BencodeError::Expected("'i', 'l', 'd', or a digit")),
    }
}

fn decode_int(input: &[u8], pos: &mut usize) -> Result<BValue, BencodeError> {
    *pos += 1; // 'i'
    let start = *pos;
    while input.get(*pos).is_some_and(|b| *b != b'e') {
        *pos += 1;
    }
    if *pos >= input.len() {
        return Err(BencodeError::UnexpectedEof);
    }
    let s = std::str::from_utf8(&input[start..*pos]).map_err(|_| BencodeError::InvalidInt)?;
    let n: i64 = s.parse().map_err(|_| BencodeError::InvalidInt)?;
    *pos += 1; // 'e'
    Ok(BValue::Int(n))
}

/// Shared by `decode_value` (byte-string values) and `decode_dict` (byte-
/// string keys) — bencode uses the identical `<len>:<bytes>` grammar for
/// both, so there is exactly one place this can go wrong.
fn decode_bytes(input: &[u8], pos: &mut usize) -> Result<Vec<u8>, BencodeError> {
    let start = *pos;
    while input.get(*pos).is_some_and(|b| *b != b':') {
        *pos += 1;
    }
    if *pos >= input.len() {
        return Err(BencodeError::UnexpectedEof);
    }
    let len_str = std::str::from_utf8(&input[start..*pos]).map_err(|_| BencodeError::InvalidInt)?;
    let len: usize = len_str.parse().map_err(|_| BencodeError::InvalidInt)?;
    *pos += 1; // ':'
    let end = pos.checked_add(len).ok_or(BencodeError::UnexpectedEof)?;
    if end > input.len() {
        return Err(BencodeError::UnexpectedEof);
    }
    let bytes = input[*pos..end].to_vec();
    *pos = end;
    Ok(bytes)
}

fn decode_list(input: &[u8], pos: &mut usize) -> Result<BValue, BencodeError> {
    *pos += 1; // 'l'
    let mut items = Vec::new();
    loop {
        match input.get(*pos) {
            None => return Err(BencodeError::UnexpectedEof),
            Some(b'e') => {
                *pos += 1;
                break;
            }
            _ => items.push(decode_value(input, pos)?),
        }
    }
    Ok(BValue::List(items))
}

fn decode_dict(input: &[u8], pos: &mut usize) -> Result<BValue, BencodeError> {
    *pos += 1; // 'd'
    let mut map = BTreeMap::new();
    loop {
        match input.get(*pos) {
            None => return Err(BencodeError::UnexpectedEof),
            Some(b'e') => {
                *pos += 1;
                break;
            }
            _ => {
                let key = decode_bytes(input, pos)?;
                let value = decode_value(input, pos)?;
                map.insert(key, value);
            }
        }
    }
    Ok(BValue::Dict(map))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ints_round_trip() {
        let v = BValue::Int(-42);
        assert_eq!(BValue::decode(&v.encode()).unwrap(), v);
    }

    #[test]
    fn bytes_round_trip() {
        let v = BValue::bytes("hello world");
        assert_eq!(v.encode(), b"11:hello world");
        assert_eq!(BValue::decode(&v.encode()).unwrap(), v);
    }

    #[test]
    fn dict_keys_are_sorted_on_encode() {
        let mut map = BTreeMap::new();
        map.insert(b"zebra".to_vec(), BValue::Int(1));
        map.insert(b"apple".to_vec(), BValue::Int(2));
        let v = BValue::Dict(map);
        let encoded = v.encode();
        let apple_pos = encoded.windows(5).position(|w| w == b"apple").unwrap();
        let zebra_pos = encoded.windows(5).position(|w| w == b"zebra").unwrap();
        assert!(apple_pos < zebra_pos);
    }

    #[test]
    fn nested_structures_round_trip() {
        let mut inner = BTreeMap::new();
        inner.insert(b"length".to_vec(), BValue::Int(1024));
        let v = BValue::List(vec![BValue::Dict(inner), BValue::bytes("x")]);
        assert_eq!(BValue::decode(&v.encode()).unwrap(), v);
    }

    #[test]
    fn trailing_data_is_rejected() {
        let mut bytes = BValue::Int(1).encode();
        bytes.push(b'x');
        assert_eq!(BValue::decode(&bytes), Err(BencodeError::TrailingData));
    }

    #[test]
    fn truncated_input_is_rejected_not_panicking() {
        assert_eq!(BValue::decode(b"5:ab"), Err(BencodeError::UnexpectedEof));
        assert_eq!(BValue::decode(b"i5"), Err(BencodeError::UnexpectedEof));
        assert_eq!(BValue::decode(b"d3:foo"), Err(BencodeError::UnexpectedEof));
        assert_eq!(BValue::decode(b""), Err(BencodeError::UnexpectedEof));
    }

    #[test]
    fn garbage_input_is_rejected_not_panicking() {
        assert!(BValue::decode(b"garbage").is_err());
        assert!(BValue::decode(b"i-e").is_err());
        assert!(BValue::decode(b"99999999999999999999:x").is_err());
    }
}
