package db

import (
	"database/sql/driver"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
)

// Data é uma data de calendário (coluna DATE). No JSON sai como
// "AAAA-MM-DD" — é dia de negócio (data da compra, do evento), não instante,
// então não carrega fuso.
type Data struct{ time.Time }

const layoutData = "2006-01-02"

// ParseData valida "AAAA-MM-DD".
func ParseData(s string) (Data, error) {
	t, err := time.Parse(layoutData, strings.TrimSpace(s))
	if err != nil {
		return Data{}, err
	}
	return Data{t}, nil
}

func (d Data) String() string {
	if d.IsZero() {
		return ""
	}
	return d.Format(layoutData)
}

func (d Data) MarshalJSON() ([]byte, error) {
	if d.IsZero() {
		return []byte("null"), nil
	}
	return json.Marshal(d.String())
}

func (d *Data) UnmarshalJSON(b []byte) error {
	var s string
	if err := json.Unmarshal(b, &s); err != nil {
		return err
	}
	if s == "" {
		*d = Data{}
		return nil
	}
	v, err := ParseData(s)
	if err != nil {
		return err
	}
	*d = v
	return nil
}

func (d Data) Value() (driver.Value, error) {
	if d.IsZero() {
		return nil, nil
	}
	return d.String(), nil
}

func (d *Data) Scan(v any) error {
	switch x := v.(type) {
	case nil:
		*d = Data{}
	case time.Time:
		*d = Data{time.Date(x.Year(), x.Month(), x.Day(), 0, 0, 0, 0, time.UTC)}
	case string:
		p, err := ParseData(x[:min(len(x), 10)])
		if err != nil {
			return err
		}
		*d = p
	case []byte:
		return d.Scan(string(x))
	default:
		return fmt.Errorf("tipo inesperado para data: %T", v)
	}
	return nil
}

// JSON guarda um documento JSONB como texto cru (o conteúdo é validado na
// feature, não aqui).
type JSON json.RawMessage

func (j JSON) MarshalJSON() ([]byte, error) {
	if len(j) == 0 {
		return []byte("null"), nil
	}
	return j, nil
}

func (j *JSON) UnmarshalJSON(b []byte) error {
	if j == nil {
		return errors.New("db.JSON: ponteiro nulo")
	}
	*j = append((*j)[0:0], b...)
	return nil
}

func (j JSON) Value() (driver.Value, error) {
	if len(j) == 0 {
		return nil, nil
	}
	return string(j), nil
}

func (j *JSON) Scan(v any) error {
	switch x := v.(type) {
	case nil:
		*j = nil
	case []byte:
		*j = append((*j)[0:0], x...)
	case string:
		*j = JSON(x)
	default:
		return fmt.Errorf("tipo inesperado para json: %T", v)
	}
	return nil
}
